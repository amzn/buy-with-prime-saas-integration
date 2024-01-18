const express = require("express");
const axios = require("axios");
const cors = require("cors");
const session = require("express-session");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bodyParser = require('body-parser');
require('dotenv').config()
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const app = express();

app.use(cors({ credentials: true, origin: true }));
app.use(session({secret: 'ssshhhhh',saveUninitialized: true,resave: true}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));


// this is needed to Request Hash Validations
const rawBodySaver =  (req, res, buf, encoding) =>{
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
}

app.use(bodyParser.json({verify: rawBodySaver}));

const BWP_PUBLIC_KEY = 
`-----BEGIN PUBLIC KEY----- 
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE9NrnQefbdiD4Tk65eY2r/fXtf4VV
PIBdR7qP73NhRBdNhUNfERayW67OP+ufvhpgdWUcbxXQkos8KkwL8yRMzQ==
-----END PUBLIC KEY-----`;

const BWP_AUTHORIZE_URL = "https://console.buywithprime.amazon.com/marketplace/authorize";
const BWP_TOKEN_URL = "https://api.ais.prod.vinewood.dubai.aws.dev/token";

const TOKEN_STORE_TABLE_NAME = process.env.TOKEN_STORE_TABLE_NAME
const APP_INSTALL_URL_C = process.env.APP_INSTALL_URL_C
const APP_INSTALL_URL = APP_INSTALL_URL_C.toLowerCase()  

const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET

app.get("/", (req, res) => {
    try {
        res.send("Answer from web server")
    } catch (err) {
        console.log("Access from browser failed")
        res.send(err)
    }
})

app.get("/hc", (req, res) => {
    console.log("Health check")
    try {
        console.log("Health check completed")
        console.log(CLIENT_ID)
        res.send(req)
    } catch (err) {
        res.send(err)
    }
})
// Launch URL
app.get("/launch", (req, res) => {
    let state = Math.random();
    req.session.state = state;
    
    // Generate a unique code verifier for OAuth 2.0 PKCE authentication
    let codeVerifier = generateCodeVerifire(); 
    req.session.codeVerifier = codeVerifier

    // Generate a code challenge using code verifier
    let codeChallenge = generateCodeChallenge(codeVerifier) 
    let redirect_url = `${BWP_AUTHORIZE_URL}?response_type=code&client_id=${CLIENT_ID}&state=${state}&redirect_uri=${encodeURIComponent(APP_INSTALL_URL)}&code_challenge=${codeChallenge}&code_challenge_method=S256` 
    console.log("/launch")
    console.log("Launch request initiated")
    console.log(redirect_url)
    res.redirect(
        redirect_url
    );
});

// Install URL
app.get("/install", (req, res) => {
    try{
        validateState(req);
        let tokenPayload = validateVerificationToken(req);
        var installationId = tokenPayload.installationId;
        console.log("/install");
        console.log("installation ID is " , installationId);

    }catch(err){
        res.send(err);
        return;
    }
    
    let authCode = req.query.code;
    let codeVerifier = req.session.codeVerifier;

    console.log("/install - code verifier", codeVerifier)

    axios.post(
        BWP_TOKEN_URL,
        `grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&redirect_uri=${encodeURIComponent(APP_INSTALL_URL)}&code=${authCode}&code_verifier=${codeVerifier}`,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    ).then((response) => {
        console.log(`Auth Token: ${JSON.stringify(response.data)}`);
        let params = {
            TableName: TOKEN_STORE_TABLE_NAME,
            Item: {
                installation_id:  installationId,
                updated_at: Date.now() / 1000,
                token: response.data.access_token,
                refresh_token: response.data.refresh_token
            }
        }
        docClient.put(params, function(err, data) {
            if (err) {
                console.log("Error", err);
            } else {
                console.log("Success", data);
            }
        });
        res.send(response.data);
    }).catch((err) => {
        res.send(err.response.data);
    });
});


// Settings URL
app.get("/settings", (req, res) => {
    try{
        console.log("/settings ", payload.installationId)
        let payload = validateVerificationToken(req);
        res.send(payload.installationId);
    }catch(err){
        res.send(err);
    }
});

//Uninstall URL
app.post("/uninstall", (req,res) => {
    try{
        console.log("/uninstall ", payload.installationId)

        let payload = validateVerificationToken(req);
        console.log(payload.installationId, " requested to uninstall")
        res.send(payload.installationId);
    }catch(err){
        console.log(err)
        res.send(err);
    }
});

function validateState(req){
    if (!req.query.state || req.session.state != req.query.state){
        throw "Invalid State";
    }
}

function validateVerificationToken(req){
    let token = req.query["verification-token"];
    token = token ? token : req.headers["verification-token"];

    if(!token){
        throw "Missing Verification Token";
    }

    let payload = jwt.verify(token, BWP_PUBLIC_KEY);

    let expectedHash = payload.requestHash;
    let actualHash = calculateRequestHash(req);

    if(expectedHash !== actualHash){
        throw "Actual request hash does not match the expected hash";
    }    

    return payload;
};

function calculateRequestHash(req){
    let url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if(url.includes("verification-token")){
        url = url.substring(0, url.indexOf("verification-token=") - 1);
    }

    let bodyHash = req.rawBody ? crypto.createHash('sha256').update(req.rawBody, "utf8").digest('hex') : "";
    return crypto.createHash('sha256').update(url + bodyHash, "utf8").digest('hex');
}

// This function generates a code verifier for OAuth 2.0 PKCE.
// It creates a random 32-byte value and encodes it in hexadecimal format.
// The code verifier is used later to generate the code challenge.
function generateCodeVerifire(){
    const randomBytes = crypto.randomBytes(32);
    const verifier = randomBytes.toString('hex');
    console.log("codeVerifier", verifier)

    return verifier
}

// This function generates a code challenge from a given code verifier.
// It hashes the verifier using SHA256 and then encodes the hash in base64 URL format.
// The code challenge is used in the OAuth 2.0 authorization request.
function generateCodeChallenge(verifier){
    console.log("code-verifier before encoding", verifier)
    const hash = crypto.createHash('sha256').update(verifier).digest();
    const base64UrlEncoded = hash.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    console.log("code challenge", base64UrlEncoded)

    return base64UrlEncoded;
}


const PORT = 8080;

app.listen(PORT, () => {
    console.log(`Listening at port ${PORT}`);
});