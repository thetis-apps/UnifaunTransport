# Introduction

This application enables the printing of shipping labels from the carrier Postnord as an integrated part of your packing process. 

# Installation

You may install the latest version of the application from the Serverless Applicaation Repository. It is registered under the name thetis-ims-postnord-transport.

## Parameters

When installing the application you must provide values for the following parameters:

- ContextId
- ThetisClientId
- ThetisClientSecret
- ApiKey
- DevOpsEmail

A short explanation for each of these parameters are provided upon installation.

## Initialization

Upon installation the application creates a carrier by the name 'Postnord'.

# Configuration

In the data document of the carrier named 'Postnord':
```
{
  "PostnordTransport": {
    "pin": "U2YW3OMPKC3B5FB5FDF2BJD6",
    "test": true,
    "user": "RAFRFWPPDI5PHJ5W",
    "bulkId": "1",
    "senderQuickId": "DEMO"
  }
}
```

For your convenience the application is initially configured to use our test credentials. You may use this configuration as long as you keep the value of the test attribute to true.

To get your own credentials contact Postnord.

# Events

## Packing completed

When packing of a shipment is completed, the application registers the shipment with Postnord. The shipment is updated with the carriers shipment number.

The shipping containers are updated with the tracking numbers assigned to the corresponding Postnord packages.

Shipping labels are attached to the shipment.

