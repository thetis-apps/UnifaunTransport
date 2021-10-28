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
			setup.bulkId = "1";
			setup.senderQuickId = "DEMO";
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

async function getUnifaun(setup) {
 
    const unifaunUrl = "https://api.unifaun.com/rs-extapi/v1/";
    
    var unifaun = axios.create({
		baseURL: unifaunUrl, 
		headers: { "Authorization": "Bearer " + setup.user + "-" + setup.pin },
		validateStatus: function (status) {
		    return status >= 200 && status < 300 || status == 422; // default
		}
	});
	
	unifaun.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
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

function setPartyAddress(party, address) {
	party.name = address.addressee;
	party.address1 = address.streetNameAndNumber;
	party.address2 = address.districtOrCityArea;
	party.city = address.cityTownOrVillage;
	party.state = address.stateOrProvince;
	party.country = address.cuntryCode;
	party.zipcode = address.postalCode;
}

function setPartyContact(party, contactPerson) {
	party.contact = contactPerson.name;
	party.email = contactPerson.email;
	party.mobile = contactPerson.mobileNumber;
	party.phone = contactPerson.phoneNumber;
}

/**
 * A Lambda function that get shipping labels from unifaun.
 */
exports.shippingLabelRequestHandler = async (event, context) => {
	
    console.info(JSON.stringify(event));

    var detail = event.detail;
    var shipmentId = detail.shipmentId;
    var contextId = detail.contextId;

	let ims = await getIMS();
	
    let response = await ims.get("carriers");
    let carriers = response.data;
    
    let carrier = lookupCarrier(carriers, 'Postnord');
    let dataDocument = JSON.parse(carrier.dataDocument);
    let setup = dataDocument.PostnordTransport;
    
	let unifaun = await getUnifaun(setup);

    response = await ims.get("shipments/" + shipmentId);
    let shipment = response.data;
    
	let unifaunShipment = new Object();
	
	// Set print configuration
	
	let printConfig = { 
		target1Media: "thermo-190",
		target1Type: "pdf",
		target1YOffset: 0,
	    target1XOffset: 0,
	    target1Options: [{
	      key: "mode",
	      value: "DT"
	    }],
	    target2Media: null,
	    target2Type: "pdf",
	    target2YOffset: 0,
	    target2XOffset: 0,
	    target3Media: null,
	    target3Type: "pdf",
	    target3YOffset: 0,
	    target3XOffset: 0,
	    target4Media: null,
	    target4Type: "pdf",
	    target4YOffset: 0,
	    target4XOffset: 0 };
  
	
	// Set shipment attributes
	
	unifaunShipment.orderNo = shipment.shipmentNumber;
	unifaunShipment.senderReference = shipment.sellersReference;
	unifaunShipment.receiverReference = shipment.customersReference;
	unifaunShipment.deliveryDate = shipment.deliveryDate;
	unifaunShipment.note = shipment.notesOnShipping;
	unifaunShipment.deliveryInstruction = shipment.notesOnDelivery;
	unifaunShipment.test = setup.test;
	
	// Set service code 

	let service = new Object();
	if (shipment.deliverToPickUpPoint) {
		service.id = "P19DK";
	} else {
		if (shipment.deliveryAddress.countryCode == "DK") {
			service.id = "PDK17";
		} else {
			service.id = "PDKBREVI";
			unifaunShipment.bulkId = setup.bulkId;
		}
	}
	unifaunShipment.service = service;
	
	// Set receiver
	
	unifaunShipment.receiver = new Object();
	setPartyAddress(unifaunShipment.receiver, shipment.deliveryAddress);
	setPartyContact(unifaunShipment.receiver, shipment.contactPerson);
	unifaunShipment.receiver.custNo = shipment.customerNumber;

	// Set sender

	unifaunShipment.sender = new Object();
    var sellerId = shipment.sellerId;
	if (sellerId != null) {
	    response = await ims.get("sellers/" + sellerId);
	    let seller = response.data;
	    setPartyAddress(unifaunShipment.sender, seller.address);
	    setPartyContact(unifaunShipment.sender, seller.contactPerson);
	} else {
		response = await ims.get("contexts/" + shipment.contextId);
		let context = response.data;
	    setPartyAddress(unifaunShipment.sender, context.address);
	    setPartyContact(unifaunShipment.sender, context.contactPerson);
	}
    unifaunShipment.sender.quickId = setup.senderQuickId;
	
	// Set add-on services

	let addons = [];
	if (shipment.deliverToPickUpPoint) {
		
		let addon = new Object();
		addon.id = "PUPOPT";
		addons.push(addon);

		let agent = new Object();
		agent.quickId = shipment.pickUpPointId;
		unifaunShipment.agent = agent;

	}

	if (shipment.contactPerson.email != null) {
		let addon = new Object();
		addon.id = "NOTEMAIL";
		addons.push(addon);
	}

	if (shipment.contactPerson.mobileNumber != null) {
		let addon = new Object();
		addon.id = "NOTSMS";
		addons.push(addon);
	}

	service.addons = addons;

	// Create parcels

	let i = 1;
	let parcels = [];
	let shippingContainers = [];
	shippingContainers = shipment.shippingContainers;
	shippingContainers.forEach(function(shippingContainer) {
		let parcel = new Object();
		parcel.copies = 1;
		parcel.weight = shippingContainer.grossWeight;
		let dimensions = shippingContainer.dimensions;
		if (dimensions != null) {
			parcel.height = dimensions.height;
			parcel.width = dimensions.width;
			parcel.length = dimensions.length;
		} 
		parcel.reference = shippingContainer.id;
		parcels.push(parcel);
		i++;
	});
	
	unifaunShipment.parcels = parcels;
	
	// Now post the shipment to Unifaun
	
    let unifaunRequest = new Object();
	unifaunRequest.printConfig = printConfig;
	unifaunRequest.shipment = unifaunShipment;
	
	console.log(JSON.stringify(unifaunRequest));

    response = await unifaun.post("shipments", unifaunRequest, { params: { "returnFile": true }});

	if (response.status == 422) {
		
		// Send error messages
		
		let errors = response.data;
		for (let i = 0; i < errors.length; i++) {
			let error = errors[i];
			let message = new Object();
			message.time = Date.now();
			message.source = "PostnordTransport";
			message.messageType = "ERROR";
			message.messageText = "Failed to register shipment with Postnord. Postnord says: " + error.field + ": " + error.message;
			message.deviceName = detail.deviceName;
			message.userId = detail.userId;
			await ims.post("events/" + detail.eventId + "/messages", message);
		}
		
	} else {
    
    	let unifaunResponse = response.data[0];
    
		console.log(JSON.stringify(unifaunResponse));

    	// Attach labels to shipment
    	
    	let prints = unifaunResponse.prints;
    	for (let i = 0; i < prints.length; i++) {
    		let print = prints[i];
			let shippingLabel = new Object();
			shippingLabel.base64EncodedContent = print.data;
			shippingLabel.fileName = "SHIPPING_LABEL_" + shipmentId + ".pdf";
			await ims.post("shipments/"+ shipmentId + "/attachments", shippingLabel);
    	}
    	
    	// Set tracking number on shipping containers

		parcels = unifaunResponse.parcels;
		for (let i = 0; i < unifaunResponse.parcels.length; i++) {
			let shippingContainer = shippingContainers[i];
			let parcel = parcels[i];
			await ims.patch("shippingContainers/" + shippingContainer.id, { trackingNumber: parcel.parcelNo });
		}
		
		// Set carriers shipment number
		
		await ims.patch("shipments/" + shipment.id, { carriersShipmentNumber: unifaunResponse.id })
		
		// Send a message to signal that we are done
		
		var message = new Object();
		message.time = Date.now();
		message.source = "PostnordTransport";
		message.messageType = "INFO";
		message.messageText = "Labels are ready";
		message.deviceName = detail.deviceName;
		message.userId = detail.userId;
		await ims.post("events/" + detail.eventId + "/messages", message);
	
	}

	return "done";

}
