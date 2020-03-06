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



exports.handler = function(event, context, callback) {

    console.log('Received event in Authorizer lambda:', JSON.stringify(event, null, 2));
    let token = event.authorizationToken;

    // ---------------------------------------------------------------------------------------------
    // The environment variable contains the valid security token
    // that the client must send as part of the request.
    // ---------------------------------------------------------------------------------------------
    let allowedToken = process.env['ALLOWED_SECURITY_TOKEN'].toLowerCase();

    console.log('Expected authorization token: ' + allowedToken);
    console.log('Actual authorization token: ' + token);

    // ---------------------------------------------------------------------------------------------
    // Generate PrincipalId for the policy
    // It is of format apiUser-<region>-<accountId>-<lambdaName>
    // ---------------------------------------------------------------------------------------------
    let tmp = event.methodArn.split(':');
    let principalId = 'apiUser-' + tmp[3] + '-' + tmp[4] + '-' + tmp[6];

    switch(token.toLowerCase()) {
        case allowedToken:
            console.log('Expected and actual authorization tokens match');
            callback(null, generatePolicy(principalId, 'Allow', event.methodArn));
            break;
        default:
            console.log('Expected and actual authorization tokens do not match - returning Unauthorized');
            callback('Unauthorized');    
    }
};


// -------------------------------------------------------------------------------------------------
// Helper function to generate a valid policy document that allows API Gateway to invoke the
// actual lambda
// -------------------------------------------------------------------------------------------------
function generatePolicy(principalId, effect, resource)
{
    let authResponse = {};

    authResponse.principalId = principalId;

    if(effect && resource) {
        let policyDocument = {};
        let statementOne   = {};

        policyDocument.Version   = "2012-10-17";
        policyDocument.Statement = [];
        statementOne.Action      = 'execute-api:Invoke';
        statementOne.Effect      = effect;
        statementOne.Resource    = resource;
        policyDocument.Statement[0] = statementOne;

        authResponse.policyDocument = policyDocument;
    }

    return authResponse;
}

