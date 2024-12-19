
module.exports = {

  // Decimal codes for the instructions supported by Kramer Matrix (Protocol 2000).
  // See https://kramerav.com/support/download.asp?f=35567
  // See https://kramerav.com/downloads/protocols/protocol_2000_rev0_51.pdf
  SWITCH_VIDEO : 1,
  SWITCH_AUDIO : 2,
  STORE_SETUP : 3,
  RECALL_SETUP : 4,
  REQUEST_VIDEO_STATUS : 5,
  REQUEST_AUDIO_STATUS : 6,
  FRONT_PANEL : 30,
  DEFINE_MACHINE : 62,
  ERROR : 80,

  CAPS_VIDEO_INPUTS : 1,
  CAPS_VIDEO_OUTPUTS : 2,
  CAPS_SETUPS : 3,

  //  Define the protocols this module may support:
  PROTOCOL_2000 : "2000",
  PROTOCOL_3000 : "3000",

  // Define the possible parameters to disconnect an output:
  DISCONNECT_0 : "0",
  DISCONNECT_INP1 : "+1",
  

  // Protocol 2000: The most significant bit for bytes 2-4 must be 1. Adding 128 to
  //  each of those bytes accomplishes this.
  MSB : 128,
  
  
  //  Define the connection protocols this module will use:
  CONNECT_TCP : "TCP",
  CONNECT_UDP : "UDP",

  // Define the possible Protocol 3000 commands to route video:
  ROUTE_ROUTE : "ROUTE",
  ROUTE_VID : "VID",

  
  
}