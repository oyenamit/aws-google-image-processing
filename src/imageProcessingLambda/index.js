/* ***** BEGIN LICENSE BLOCK *****
 *
 * Copyright (C) 2020 Namit Bhalla (oyenamit@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.

 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>
 *
 * ***** END LICENSE BLOCK ***** */



exports.handler = (event, context, callback) => {

    console.log('Received event in image processing lambda:', JSON.stringify(event, null, 2));

    const request  = require('request');
    const aws      = require('aws-sdk');
    const vision   = require('@google-cloud/vision');
    const language = require('@google-cloud/language');

    // Value to be returned
    let retval = {
        statusCode: 200,

        // -----------------------------------------------------------------------------------------
        // Since the API Gateway uses 'Lambda Proxy' for 'Integration Request', these headers
        // will not be automatically sent as part of response. We need to explicitly send them as
        // part of lambda response.
        // -----------------------------------------------------------------------------------------
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },

        body: JSON.stringify({ 'first_name': 'unknown', 'last_name': 'unknown' })
    };


    // ---------------------------------------------------------------------------------------------
    // The Google API key is present in an environment variable.
    // It is actually the entire JSON key file received from Google Console.
    // It is encrypted using AWS client-side encryption and encoded in base64 format.
    // ---------------------------------------------------------------------------------------------
    const kms = new aws.KMS();
    const google_api_key_encrypted = process.env['GOOGLE_API_KEY'];
    if(!google_api_key_encrypted)
    {
        console.log('Improper lambda configuration - environment variable \'GOOGLE_API_KEY\' not set up');
        retval.statusCode = 500;
        callback(null, retval);
        return;
    }


    // ---------------------------------------------------------------------------------------------
    // Decrypt the key and parse its contents 
    // ---------------------------------------------------------------------------------------------
    kms.decrypt( { CiphertextBlob: new Buffer.from(google_api_key_encrypted, 'base64') }, (err, data) => {
        if(err) {
            console.log('Error from KMS: ' + err);
            retval.statusCode = 500;
            callback(null, retval);
            return;
        }

        let google_api_key_decrypted = data.Plaintext.toString('ascii');
        let creds = JSON.parse(google_api_key_decrypted);

        // -----------------------------------------------------------------------------------------
        // The image data should be sent by the client inside a JSON object with key as 'imgdata'.
        // It should be base64 encoded.
        // -----------------------------------------------------------------------------------------
        if(!event.body)
        {
            retval.statusCode = 400;    // 400: Bad Request
            callback(null, retval);
            return;
        }

        let encodedImage = JSON.parse(event.body).imgdata;
        if(!encodedImage)
        {
            retval.statusCode = 400;    // 400: Bad Request
            callback(null, retval);
            return;
        }

        // -----------------------------------------------------------------------------------------
        // We don't really need to decode the data since Google Vision APIs also expect base64
        // encoded image data.
        // let decodedImage = new Buffer.from(encodedImage, 'base64');
        // -----------------------------------------------------------------------------------------


        // -----------------------------------------------------------------------------------------
        // Begin image processing
        // -----------------------------------------------------------------------------------------

        // Credentials for Google APIs
        const google_api_options = {
            credentials: {
                client_email: creds.client_email,
                private_key:  creds.private_key
            }
        };

        const visionclient = new vision.ImageAnnotatorClient(google_api_options);

        // Input data for Google Vision API
        const req_data = {
            image: {
                content: encodedImage
            }
        };

        console.log('Invoking Google Vision API to convert image to text');
        visionclient.textDetection(req_data)
            .then(res => {

                let ocrtext = res[0].textAnnotations[0].description;

                // res.forEach(out => console.log(out));
                console.log('Response from Google Vision API: ' + ocrtext);

                // ---------------------------------------------------------------------------------
                // Begin entity identification
                // ---------------------------------------------------------------------------------
                const client = new language.LanguageServiceClient(google_api_options);
                const document = {
                    content: ocrtext,
                    type: 'PLAIN_TEXT',
                };

                console.log('Invoking Google NLP API to identify entities in text');
                client.analyzeEntities({document: document})
                    .then(result => {
                        console.log('Successful response from Google NLP API');
                        let entities = result[0].entities;
                        // console.log('Entities: ' + JSON.stringify(entities));

                        // -------------------------------------------------------------------------
                        // Extract First Name and Last Name from the response
                        // -------------------------------------------------------------------------
                        let first_name = "";
                        let last_name  = "";
                        for(let i = 0; i < entities.length; ++i)
                        {
                            if(entities[i].type.toLowerCase() === 'person')
                            {
                                if(entities[i].name)
                                {
                                    let parts = entities[i].name.trim().split(' ');
                                    first_name = parts[0];
                                    parts.shift();
                                    last_name = parts.join(' ');
                                }

                                break;
                            }
                        }

                        console.log('Found first_name: ' + first_name + ' last_name: ' + last_name);
                        retval.statusCode = 200;
                        retval.body = JSON.stringify({ "first_name": first_name, "last_name": last_name });
                        callback(null, retval);
                    })
                    .catch(err => {
                        console.log('Error received from Google NLP API: ' + err);
                        retval.statusCode = 500;
                        callback(null, retval);
                    });
            })
            .catch(err => {
                console.log('Error received from Google Vision API: ' + err);
                retval.statusCode = 500;
                callback(null, retval);
            });
    });
};

