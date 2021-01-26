/**
 * Copyright 2021 Thetis Apps Aps
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * 
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * 
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const axios = require('axios');

var { DateTime } = require('luxon');

var AWS = require('aws-sdk');
AWS.config.update({region:'eu-west-1'});

function createUnifaunAddress(address, contactPerson) {
	var unifaunAddress = new Object(); 
	if (contactPerson != null) {
		unifaunAddress.contact = contactPerson.name;
		unifaunAddress.email = contactPerson.email;
		unifaunAddress.mobile = contactPerson.mobileNumber;
		unifaunAddress.phone = contactPerson.phoneNumber;
	} 
	unifaunAddress.name1 = address.addressee;
	unifaunAddress.street1 = address.streetNameAndNumber;
	unifaunAddress.zipCode = address.postalCode;
	unifaunAddress.city = address.cityTownOrVillage;
	unifaunAddress.countryCode = address.countryCode;
	return unifaunAddress;
}

/**
 * Send a response to CloudFormation regarding progress in creating resource.
 */
async function sendResponse(input, context, responseStatus, reason) {

	let responseUrl = input.ResponseURL;

	let output = new Object();
	output.Status = responseStatus;
	output.PhysicalResourceId = "StaticFiles";
	output.StackId = input.StackId;
	output.RequestId = input.RequestId;
	output.LogicalResourceId = input.LogicalResourceId;
	output.Reason = reason;
	await axios.put(responseUrl, output);
}

exports.initializer = async (input, context) => {
	
	try {
		let ims = await getIMS();
		let requestType = input.RequestType;
		if (requestType == "Create") {
			let carrier = new Object();
			carrier.carrierName = "Postnord";
		    let setup = new Object();
			setup.user = "RAFRFWPPDI5PHJ5W";
			setup.pin = "U2YW3OMPKC3B5FB5FDF2BJD6";
			setup.test = true;
			setup.mediaType = "THERMO_190";
			let dataDocument = new Object();
			dataDocument.PostnordTransport = setup;
			carrier.dataDocument = JSON.stringify(dataDocument);
			await ims.post("carriers", carrier);
		}
		await sendResponse(input, context, "SUCCESS", "OK");

	} catch (error) {
		await sendResponse(input, context, "SUCCESS", JSON.stringify(error));
	}

}

async function getIMS() {
	
    const authUrl = "https://auth.thetis-ims.com/oauth2/";
    const apiUrl = "https://api.thetis-ims.com/2/";

	var clientId = process.env.ClientId;   
	var clientSecret = process.env.ClientSecret; 
	var apiKey = process.env.ApiKey;  
	
    let data = clientId + ":" + clientSecret;
	let base64data = Buffer.from(data, 'UTF-8').toString('base64');	
	
	var imsAuth = axios.create({
			baseURL: authUrl,
			headers: { Authorization: "Basic " + base64data, 'Content-Type': "application/x-www-form-urlencoded" },
			responseType: 'json'
		});
    
    var response = await imsAuth.post("token", 'grant_type=client_credentials');
    var token = response.data.token_type + " " + response.data.access_token;
    
    var ims = axios.create({
    		baseURL: apiUrl,
    		headers: { "Authorization": token, "x-api-key": apiKey, "Content-Type": "application/json" }
    	});
	

	ims.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			console.log(JSON.stringify(error));
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
			}
	    	return Promise.reject(error);
		});

	return ims;
}

async function getUnifaun(ims, eventId) {
 
    const unifaunUrl = "https://api.gls.dk/ws/DK/V1/";
    
    var unifaun = axios.create({
		baseURL: unifaunUrl
	});
	
	unifaun.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
				var message = new Object
				message.time = Date.now();
				message.source = "unifaunTransport";
				message.messageType = "ERROR";
				message.messageText = error.response.data.Message;
				ims.post("events/" + eventId + "/messages", message);
			}
	    	return Promise.reject(error);
		});

	return unifaun;
}

function lookupCarrier(carriers, carrierName) {
	let i = 0;
    let found = false;
    while (!found && i < carriers.length) {
    	let carrier = carriers[i];
    	if (carrier.carrierName == carrierName) {
    		found = true;
    	} else {
    		i++;
    	}	
    }
    
    if (!found) {
    	throw new Error('No carrier by the name ' + carrierName);
    }

	return carriers[i];
}

/**
 * A Lambda function that get shipping labels for parcels from unifaun.
 */
exports.shippingLabelRequestHandler = async (event, context) => {
	
    console.info(JSON.stringify(event));

    var detail = event.detail;
    var shipmentId = detail.shipmentId;
    var contextId = detail.contextId;

	let ims = await getIMS();
	
	let unifaun = await getUnifaun(ims, detail.eventId);

    let response = await ims.get("carriers");
    var carriers = response.data;
    
    let carrier = lookupCarrier(carriers, 'Postnord');
    var dataDocument = JSON.parse(carrier.dataDocument);
    var setup = dataDocument.GLSTransport;
    
    response = await ims.get("shipments/" + shipmentId);
    var shipment = response.data;
    
	var unifaunShipment = new Object();
	
	let i = 1;
	var parcels = [];
	var shippingContainers = [];
	shippingContainers = shipment.shippingContainers;
	shippingContainers.forEach(function(shippingContainer) {
    		var parcel = new Object();
    		
    		
    		parcels.push(parcel);
    		i++;
    	});
	
	unifaunShipment.parcels = parcels;
	
	var contactPerson = shipment.contactPerson;
	var unifaunDeliveryAddress = createUnifaunAddress(shipment.deliveryAddress, contactPerson);
	
	var senderAddress;
	var senderContactPerson;
    var sellerId = shipment.sellerId;
	if (sellerId != null) {
	    response = await ims.get("sellers/" + sellerId);
		senderAddress = response.data.address;
		senderContactPerson = response.data.contactPerson;
	} else {
		senderAddress = context.address;
		senderContactPerson = context.contactPerson;
	}
	var unifaunAlternativeShipper = createUnifaunAddress(senderAddress, senderContactPerson);
	
    response = await unifaun.post("CreateShipment", unifaunShipment);
    var unifaunResponse = response.data;
    
	var shippingLabel = new Object();
	shippingLabel.base64EncodedContent = unifaunResponse.PDF;
	shippingLabel.fileName = "SHIPPING_LABEL_" + shipmentId + ".pdf";
	await ims.post("shipments/"+ shipmentId + "/attachments", shippingLabel);

	await ims.put("shipments/" + shipmentId + "/consignmentId", unifaunResponse.consignmentId);

	for (let i = 0; i < unifaunResponse.parcels.length; i++) {
		let shippingContainer = shippingContainers[i];
		let parcel = parcels[i];
		ims.put("shippingContainers/" + shippingContainer.id + "/trackingNumber", parcel.parcelNumber);
	}
	
	var message = new Object();
	message.time = Date.now();
	message.source = "unifaunTransport";
	message.messageType = "INFO";
	message.messageText = "Labels are ready";
	await ims.post("events/" + detail.eventId + "/messages", message);

	return "done";

}
