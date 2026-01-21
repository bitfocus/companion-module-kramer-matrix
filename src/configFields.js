const {
  Regex,
} = require("@companion-module/base");
const p2000 = require('./protocol2000')

module.exports = {


  /**
   * Return config fields for web config.
   *
   * @returns      The config fields for the module
   */
  getConfigFields() {
    return [
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Information",
        value:
          "This module works with Kramer matrices using Protocol 2000 and Protocol 3000. " +
          "Check your matrices' manual to confirm which protocol is supported.",
      },
      {
        type: "textinput",
        id: "host",
        label: "Target IP",
        width: 3,
        regex: Regex.IP,
      },
      {
        type: "dropdown",
        id: "protocol",
        label: "Protocol",
        default: p2000.PROTOCOL_3000,
        width: 4,
        choices: [
          { id: p2000.PROTOCOL_2000, label: "Protocol 2000" },
          { id: p2000.PROTOCOL_3000, label: "Protocol 3000" },
        ],
      },
      {
        type: "dropdown",
        id: "connectionProtocol",
        label: "TCP or UDP",
        default: p2000.CONNECT_TCP,
        width: 2,
        choices: [
          { id: p2000.CONNECT_TCP, label: "TCP" },
          { id: p2000.CONNECT_UDP, label: "UDP" },
        ],
      },
      {
        type: "textinput",
        id: "port",
        label: "Port number",
        default: "5000",
        width: 3,
        regex: Regex.PORT
      },
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Counts",
        value: "Set the number of inputs, outputs, and presets the matrix supports."
      },
      
      {
        type: "textinput",
        id: "inputCount",
        label: "Input count",
        default: '',
        width: 3,
        regex: "/^\\d*$/",
        },
      {
        type: "textinput",
        id: "outputCount",
        label: "Output count",
        default: '',
        width: 3,
        regex: "/^\\d*$/",
      },
      {
        type: "textinput",
        id: "setupsCount",
        label: "Setup count",
        default: '',
        width: 3,
        regex: "/^\\d*$/",
      },
	  
	  {
        type: "checkbox",
        id: "disableAudio",
        label: "Disable Audio",
        width : 3,
        default: false,
      },
	  
	  {
		type: "textinput",
		id: "assignations",
	    label: "Assignation file",
	    width: 12
	  },	
	  
	  {
        type: "checkbox",
        id: "timingSettings",
        label: "Message timing Settings",
        width : 3,
        default: false,
      },

	  {
		  type: "number",
		  id: "responseTimeout",
		  label: "Timeout waiting for response before next attempt",
          isVisible: (options) => { return options.timingSettings;},
		  default: 35
	  },
	  
	  {
		  type: "number",
		  id: "messageTimeout",
		  label: "Timeout for next message after receiving response",
          isVisible: (options) => { return options.timingSettings;},
		  default: 0
	  },
	  
	  {
		  type: "number",
		  id: "maxAttempts",
		  label: "Max attempts before error",
          isVisible: (options) => { return options.timingSettings;},
		  default: 20
	  },
	  
	  
      {
        type: "static-text",
        id: "info_customize",
        width: 12,
        label: "Customize",
        value:
          "Different matrices may use different commands. Customize them here. Leave default if unsure.",
        isVisible : (options) => { return (options.protocol == "3000");},
      },
      {
        type: "dropdown",
        id: "customizeRoute",
        label: "Route command",
        default: p2000.ROUTE_VID,
        width: 4,
        choices: [
          { id: p2000.ROUTE_ROUTE, label: "#ROUTE" },
          { id: p2000.ROUTE_VID, label: "#VID" },
        ],
        isVisible : (options) => { return (options.protocol == "3000");},
      },
      {
        type: "dropdown",
        id: "customizeDisconnect",
        label: "Disconnect parameter",
        default: p2000.DISCONNECT_0,
        width: 4,
        choices: [
          { id: p2000.DISCONNECT_0, label: "0 (most common)" },
          { id: p2000.DISCONNECT_INP1, label: "Number of inputs +1" },
        ],
        isVisible : (options) => { return (options.protocol == "3000");},
      },
    ];
  },

  
}