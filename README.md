# Storyline Unzipper Lambda Function

This repo contains code for an AWS Lambda Function that will unzip zipped ASL Storyline files, replace some outdated JavaScript, and upload the unzipped files to an S3 bucket where they can be read by the DigitalLearn application.

## Deployment

### NPM

Make sure you are using the same version of NPM as the lambda function (ex/ 12.x)

### Node Modules

Install node modules before attempting to build and deploy the project with `npm install`

### Build zip

`zip -r function.zip .`

### Deploy function

`aws lambda update-function-code --function-name ProcessLessons --zip-file fileb://function.zip`
