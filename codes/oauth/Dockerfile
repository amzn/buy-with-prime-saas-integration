FROM --platform=linux/amd64 node:18 as build
WORKDIR /app
COPY app/* ./
RUN npm install 
FROM node:alpine as main
COPY --from=build /app /
EXPOSE 8080
CMD ["node", "app.js"]
