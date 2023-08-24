
import { SecretsManagerClient, GetSecretValueCommand} from "@aws-sdk/client-secrets-manager";
import * as docClient from "@aws-sdk/client-dynamodb";
import * as jwt from "jsonwebtoken";
import * as crypto from "crypto";
import axios from "axios";
import express from "express";
import cors from "cors";
import session from "express-session";
import bodyParser from "body-parser";

const sm = new SecretsManagerClient();

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

export const getSecretValue = async (secretName) => {
  const client = new SecretsManagerClient();
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: secretName,
    })
  );
  const secretJSON = JSON.parse(response.SecretString);
  return [secretJSON.client_id, secretJSON.client_secret];
};

let secret = await getSecretValue("bwp-saas-oauth-client-secret"); 

let CLIENT_ID = secret[0];
let CLIENT_SECRET = secret[1];

app.get("/", (req, res) => {
    try {
        console.log("Access from browser")
        res.send("Answer from web server - ECS container")
    } catch (err) {
        console.log("Access from browser failed")
        res.send(err)
    }
})

app.get("/hc", (req, res) => {
    console.log("Health check")
    try {
        console.log("Health check completed")
        res.send(req)
    } catch (err) {
        res.send(err)
    }
})
// Launch URL
app.get("/launch", (req, res) => {

    let state = Math.random();
    req.session.state = state; 
    let redirect_url = `${BWP_AUTHORIZE_URL}?response_type=code&client_id=${CLIENT_ID}&state=${state}&redirect_uri=${encodeURIComponent(APP_INSTALL_URL)}` // secretJSON.install_uri
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
    console.log("authCode is ", authCode);
    
    axios.post(
        BWP_TOKEN_URL,
        `grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&redirect_uri=${encodeURIComponent(APP_INSTALL_URL)}&code=${authCode}`,
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


const PORT = 8080;

app.listen(PORT, () => {
    console.log(`Listening at port ${PORT}`);
});
