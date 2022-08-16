var tcp = require('../../tcp');
var udp = require('../../udp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	let self = this;

	// Decimal codes for the instructions supported by Kramer Matrix (Protocol 2000).
	// See https://kramerav.com/support/download.asp?f=35567
	// See https://kramerav.com/downloads/protocols/protocol_2000_rev0_51.pdf
	self.SWITCH_VIDEO   =  1;
	self.SWITCH_AUDIO   =  2;
	self.STORE_SETUP    =  3;
	self.RECALL_SETUP   =  4;
	self.FRONT_PANEL    = 30;
	self.DEFINE_MACHINE = 62;

	self.CAPS_VIDEO_INPUTS  = 1;
	self.CAPS_VIDEO_OUTPUTS = 2;
	self.CAPS_SETUPS        = 3;

	//  Define the protocols this module may support:
	self.PROTOCOL_2000 = '2000';
	self.PROTOCOL_3000 = '3000';

	//  Define the connection protocols this module will use:
	self.CONNECT_TCP = 'TCP';
	self.CONNECT_UDP = 'UDP';

	// Define the possible Protocol 3000 commands to route video:
	self.ROUTE_ROUTE = 'ROUTE';
	self.ROUTE_VID   = 'VID';

	// Define the possible parameters to disconnect an output:
	self.DISCONNECT_0    = '0';
	self.DISCONNECT_INP1 = '+1';
	

	// Protocol 2000: The most significant bit for bytes 2-4 must be 1. Adding 128 to
	//  each of those bytes accomplishes this.
	self.MSB = 128;

	// A promise that's resolved when the socket connects to the matrix.
	self.PromiseConnected = null;

	// The number of capabilities we're waiting responses for before saving the config.
	self.capabilityWaitingResponsesCounter = 0;

	// super-constructor
	instance_skel.apply(this, arguments);
	
	self.actions();

	return self;

}


/**
 * The user updated the config.
 * 
 * @param config         The new config object
 */
instance.prototype.updateConfig = function(config) {
	let self = this;

	// Convert to a number. Convert to 0 if empty.
	config.inputCount  = parseInt(config.inputCount  || 0);
	config.outputCount = parseInt(config.outputCount || 0);
	config.setupsCount = parseInt(config.setupsCount || 0);

	// Reconnect to the matrix if the IP or protocol changed
	if (self.config.host !== config.host || self.isConnected() === false || self.config.connectionProtocol !== config.connectionProtocol) {
		// Have to set the new host IP/protocol before making the connection.
		self.config.host               = config.host;
		self.config.connectionProtocol = config.connectionProtocol;
		self.init_connection();
	}

	// Update the rest of the config
	self.config = config;

	// If any of the values are '0' then attempt to auto-detect:
	let detectCapabilities = [];
	if (config.inputCount === 0) {
		detectCapabilities.push(self.CAPS_VIDEO_INPUTS);
	}
	if (config.outputCount === 0) {
		detectCapabilities.push(self.CAPS_VIDEO_OUTPUTS);
	}
	if (config.setupsCount === 0) {
		detectCapabilities.push(self.CAPS_SETUPS);
	}

	self.PromiseConnected.then(() => {
		// Once connected, check the capabilities of the matrix if needed.
		self.detectCapabilities(detectCapabilities);
	}).catch((err) => {
		// Error while connecting. The error message is already logged, but Node requires
		//  the rejected promise to be handled.
	});

	// Rebuild the actions to reflect the capabilities we have
	self.actions();

};


/**
 * Detects the number of inputs/outputs of the matrix.
 * 
 * @param detectCapabilities     An array of capabilities to detect from the matrix
 */
instance.prototype.detectCapabilities = function(detectCapabilities) {
	let self = this;

	// Reset the counter
	self.capabilityWaitingResponsesCounter = 0;

	if (detectCapabilities.length === 0) {
		// No capabilities to detect.
		return;
	}

	for (let i=0; i<detectCapabilities.length; i++) {
		// Ask the matrix to define its capabilities for anything unknown.
		let cmd = self.makeCommand(self.DEFINE_MACHINE, detectCapabilities[i], 1);

		// Increment the counter to show we're waiting for a response from a capability.
		self.capabilityWaitingResponsesCounter++;
		self.send(cmd);
	}

};


/**
 * Initializes the module and try to detect capabilities.
 */
instance.prototype.init = function() {
	let self = this;
	
	debug = self.debug;
	log   = self.log;

	let configUpgraded = false;

	// These config options were adding in version 1.2.0 of this module.
	// Set the defaults if not set:

	if (self.config.connectionProtocol === undefined) {
		self.config.connectionProtocol = self.CONNECT_TCP;
		configUpgraded = true;
	}

	if (self.config.customizeRoute === undefined) {
		self.config.customizeRoute = self.ROUTE_VID;
		configUpgraded = true;
	}

	if (self.config.customizeDisconnect === undefined) {
		self.config.customizeDisconnect = self.DISCONNECT_0;
		configUpgraded = true;
	}

	if (configUpgraded) {
		self.saveConfig();
	}

	self.init_connection();

};


/**
 * Connect to the matrix over TCP port 5000 or UDP port 50000.
 */
instance.prototype.init_connection = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	}

	if (!self.config.host) {
		return;
	}

	self.status(self.STATUS_WARNING, 'Connecting');

	self.PromiseConnected = new Promise((resolve, reject) => {

		switch (self.config.connectionProtocol) {
			case self.CONNECT_TCP:
				self.socket = new tcp(self.config.host, 5000, { reconnect_interval:5000 });
				break;

			case self.CONNECT_UDP:
				self.socket = new udp(self.config.host, 50000);
				self.status(self.STATUS_OK);
				debug('Connected (UDP)');
				break;

		}

		self.socket.on('error', (err) => {

			if (self.currentStatus !== self.STATUS_ERROR) {
				// Only log the error if the module isn't already in this state.
				// This is to prevent spamming the log during reconnect failures.
				debug('Network error', err);
				self.status(self.STATUS_ERROR, err);
				self.log('error', `Network error: ${err.message}`);
			}

			reject(err);

		});

		self.socket.on('connect', () => {
			// This event only fires for TCP connections.
			self.status(self.STATUS_OK);
			debug('Connected (TCP)');
			resolve();
		});

		
		if (self.config.connectionProtocol === self.CONNECT_UDP) {
			// Auto-resolve the promise if this is a UDP connection.
			resolve();
		}


	}).catch((err) => {
		// The error is already logged, but Node requires all rejected promises to be caught.
	});

	self.socket.on('status_change', (status, message) => {
		self.status(status, message);
	});

	self.socket.on('data', (data) => {
		// Note: 'data' is an ArrayBuffer

		if (typeof data !== 'object' || data.length < 4) {
			// Unknown or invalid response
			return;
		}

		switch (self.config.protocol) {
			case self.PROTOCOL_2000:
				self.receivedData2000(data);
				break;

			case self.PROTOCOL_3000:
				// data may come in as a multiline response to the request. Handle
				//  each line separately.
				data = data.toString().split("\r\n");

				for (var i=0; i<data.length; i++) {
					if (data[i].length !== 0) {
						self.receivedData3000(data[i]);
					}
				}
				break;

		}

	});

};


/**
 * Handles a response from a Protocol 2000 matrix.
 * 
 * @param data     The data received from the matrix (ArrayBuffer)
 */
instance.prototype.receivedData2000 = function(data) {
	var self = this;

	// The response to a command returns the first byte with the second most
	//  significant bit on. If we turn that second bit off, we can compare the
	//  first byte of the response to the first byte of the command sent to see
	//  what the response is for.
	switch (data[0] ^ 64) {
		case self.DEFINE_MACHINE:

			// Turn off the MSB to get the actual count of this capability.
			let count = data[2] ^ self.MSB;

			// Turn off the MSB of the second byte to see what the capability
			//  response is actually for.
			switch (data[1] ^ self.MSB) {
				case self.CAPS_VIDEO_INPUTS:
					self.log('info', `Detected: ${count} inputs.`);
					self.config.inputCount = count;
					break;

				case self.CAPS_VIDEO_OUTPUTS:
					self.log('info', `Detected: ${count} outputs.`);
					self.config.outputCount = count;
					break;

				case self.CAPS_SETUPS:
					self.log('info', `Detected: ${count} presets.`);
					self.config.setupsCount = count;
					break;

			}

			// Decrement the counter now that it responded. Save the config
			//  if all the requests responded.
			if (--self.capabilityWaitingResponsesCounter === 0) {
				// Update the actions now that the new capabilities have been stored.
				self.actions();
				self.saveConfig();
			}
			break;

	}

};


/**
 * Handles a response from a Protocol 3000 matrix.
 * 
 * @param data     The data received from the matrix (string)
 */
instance.prototype.receivedData3000 = function(data) {
	var self = this;

	// Decrement the counter now that it responded.
	--self.capabilityWaitingResponsesCounter;

	// Response will look like: ~01@COMMAND PARAMETERS
	var response = data.match(/^~\d+@([\w-]+)\s(.*)/);
	if (response === null || response.length !== 3) {
		// Bad response. Log and abort.
		self.log('error', `Error parsing response: ${data}`);
		return;
	}

	switch (response[1]) {
		case 'INFO-IO':
			// response[2] will look like: IN 11,OUT 9
			var io = response[2].match(/IN (\d+),OUT (\d+)/);
			if (io === null || io.length !== 3) {
				self.log('error', 'Error parsing input/output response.');
			}

			if (self.config.inputCount === 0) {
				self.log('info', `Detected: ${io[1]} inputs.`);
				self.config.inputCount = parseInt(io[1]);
			}
			if (self.config.outputCount === 0) {
				self.log('info', `Detected: ${io[2]} outputs.`);
				self.config.outputCount = parseInt(io[2]);
			}
			break;

		case 'INFO-PRST':
			// response[2] will look like: VID 60,AUD 0. Only care about video presets.
			var prst = response[2].match(/VID (\d+)/);
			if (prst === null || prst.length !== 2) {
				self.log('error', 'Error parsing presets response.');
			}

			if (self.config.setupsCount === 0) {
				self.log('info', `Detected: ${prst[1]} presets.`);
				self.config.setupsCount = parseInt(prst[1]);
			}
			break;

	}

	// Save the config if all the requests responded.
	if (self.capabilityWaitingResponsesCounter === 0) {
		// Update the actions now that the new capabilities have been stored.
		self.actions();
		self.saveConfig();
	}

};


/**
 * Sends the command to the Kramer matrix.
 * 
 * @param cmd      The command to send (ArrayBuffer)
 * @returns        Success state of writing to the socket
 */
instance.prototype.send = function(cmd) {
	let self = this;

	if (self.isConnected()) {
		debug('sending', cmd, 'to', self.config.host);
		return self.socket.send(cmd);
	} else {
		debug('Socket not connected');
	}

	return false;

};


/**
 * Returns if the socket is connected.
 * 
 * @returns      If the socket is connected
 */
instance.prototype.isConnected = function() {
	let self = this;

	switch (self.config.connectionProtocol) {
		case self.CONNECT_TCP:
			return self.socket !== undefined && self.socket.connected;

		case self.CONNECT_UDP:
			return self.socket !== undefined;

	}
	
	return false;

};


/**
 * Return config fields for web config.
 * 
 * @returns      The config fields for the module
 */
instance.prototype.config_fields = function() {
	let self = this;
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: "This module works with Kramer matrices using Protocol 2000 and Protocol 3000. " +
					"Check your matrices' manual to confirm which protocol is supported."
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 4,
			regex: self.REGEX_IP
		},
		{
			type: 'dropdown',
			id: 'protocol',
			label: 'Protocol',
			default: self.PROTOCOL_3000,
			width: 4,
			choices: [
				{ id: self.PROTOCOL_2000, label: 'Protocol 2000' },
				{ id: self.PROTOCOL_3000, label: 'Protocol 3000' }
			]
		},
		{
			type: 'dropdown',
			id: 'connectionProtocol',
			label: 'TCP or UDP',
			default: self.CONNECT_TCP,
			width: 4,
			choices: [
				{ id: self.CONNECT_TCP, label: 'TCP (Port 5000)' },
				{ id: self.CONNECT_UDP, label: 'UDP (Port 50000)' }
			]
		},
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Counts',
			value: "Set the number of inputs, outputs, and presets the matrix supports. " +
					"Leave a field blank to auto-detect their values."
		},
		{
			type: 'textinput',
			id: 'inputCount',
			label: 'Input count',
			default: '',
			width: 2,
			regex: '/^\\d*$/'
		},
		{
			type: 'textinput',
			id: 'outputCount',
			label: 'Output count',
			default: '',
			width: 2,
			regex: '/^\\d*$/'
		},
		{
			type: 'textinput',
			id: 'setupsCount',
			label: 'Preset count',
			default: '',
			width: 2,
			regex: '/^\\d*$/'
		},
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Customize',
			value: "Different matrices may use different commands. Customize them here. Leave default if unsure."
		},
		{
			type: 'dropdown',
			id: 'customizeRoute',
			label: 'Route command',
			default: self.ROUTE_VID,
			width: 4,
			choices: [
				{ id: self.ROUTE_ROUTE, label: '#ROUTE' },
				{ id: self.ROUTE_VID, label: '#VID' }
			]
		},
		{
			type: 'dropdown',
			id: 'customizeDisconnect',
			label: 'Disconnect parameter',
			default: self.DISCONNECT_0,
			width: 4,
			choices: [
				{ id: self.DISCONNECT_0, label: '0 (most common)' },
				{ id: self.DISCONNECT_INP1, label: 'Number of inputs +1' }
			]
		},
	]
};


/**
 * Cleanup when the module gets deleted.
 */
instance.prototype.destroy = function() {
	let self = this;
	debug('destroy', self.id);

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	}

};


/**
 * Creates the actions for this module.
 */
instance.prototype.actions = function(system) {
	let self = this;

	let inputOpts  = [ { id:'0', label: 'Off' } ];
	let outputOpts = [ { id:'0', label: 'All' } ];
	let setups     = [ ];


	// Set some sane minimum/maximum values on the capabilities
	let inputCount  = Math.min(64, Math.max(1, self.config.inputCount));
	let outputCount = Math.min(64, Math.max(1, self.config.outputCount));
	let setupsCount = Math.min(64, Math.max(1, self.config.setupsCount));

	// Build the inputs, outputs, and setups
	for (let i=1; i<=inputCount; i++) {
		inputOpts.push({ id:i, label: `Input ${i}` });
	}
	for (let i=1; i<=outputCount; i++) {
		outputOpts.push({ id:i, label: `Output ${i}` });
	}
	for (let i=1; i<=setupsCount; i++) {
		setups.push({ id:i, label: `Preset ${i}` });
	}

	self.setActions({
		'switch_audio': {
			label: 'Switch Audio',
			options: [
				{
					type: 'dropdown',
					label: 'Input #',
					id: 'input',
					default: '0',
					choices: inputOpts
				}, {
					type: 'dropdown',
					label: 'Output #',
					id: 'output',
					default: '0',
					choices: outputOpts
				}
			]
		},
		'switch_video': {
			label: 'Switch Video',
			options: [
				{
					type: 'dropdown',
					label: 'Input #',
					id: 'input',
					default: '0',
					choices: inputOpts
				}, {
					type: 'dropdown',
					label: 'Output #',
					id: 'output',
					default: '0',
					choices: outputOpts
				}
			]
		},
		'switch_video_dynamic': {
			label: 'Switch Video (Dynamic)',
			options: [
				{
					type: 'textwithvariables',
					label: 'Input #',
					id: 'input',
					default: '0'
				}, {
					type: 'textwithvariables',
					label: 'Output #',
					id: 'output',
					default: '0'
				}
			]
		},
		'switch_audio_dynamic': {
			label: 'Switch Audio (Dynamic)',
			options: [
				{
					type: 'textwithvariables',
					label: 'Input #',
					id: 'input',
					default: '0',
					regex: '/^\\d*$/'
				}, {
					type: 'textwithvariables',
					label: 'Output #',
					id: 'output',
					default: '0',
					regex: '/^\\d*$/'
				}
			]
		},
		'recall_setup': {
			label: 'Recall Preset',
			options: [
				{
					type: 'dropdown',
					label: 'Preset',
					id: 'setup',
					default: '1',
					choices: setups
				}
			]
		},
		'store_setup': {
			label: 'Store Preset',
			options: [
				{
					type: 'dropdown',
					label: 'Preset',
					id: 'setup',
					default: '1',
					choices: setups
				}
			]
		},
		'delete_setup': {
			label: 'Delete Preset',
			options: [
				{
					type: 'dropdown',
					label: 'Preset',
					id: 'setup',
					default: '1',
					choices: setups
				}
			]
		},
		'front_panel': {
			label: 'Front Panel',
			options: [
				{
					type: 'dropdown',
					label: 'Status',
					id: 'status',
					default: '0',
					choices: [
						{ id: '0', label: 'Unlock' },
						{ id: '1', label: 'Lock' },
					]
				}
			]
		}
	});

};


/**
 * Executes the action and sends the TCP packet to the Kramer matrix.
 * 
 * @param action      The action to perform
 */
instance.prototype.action = function(action) {
	let self = this;
	let cmd = undefined;


	// Clone 'action.options', otherwise reassigning the parsed variables directly will push
	//  them back into the config, because that's done by reference.
	let opt = JSON.parse(JSON.stringify(action.options));

	// Loop through each option for this action, and if any appear to be variables, parse them
	//  and reassign the result back into 'opt'.
	for (const key in opt) {
		let v = opt[key];
		if (typeof v === 'string' && v.includes('$(')) {
			self.system.emit('variable_parse', v, parsed => v = parsed.trim());
			if (v.match(/^\d+$/)) {
				opt[key] = v;
			} else {
				self.log('error', `Cannot parse '${v}' in '${action.action}.${key}' as a number. Skipping action.`);
				return;
			}
		}
	}

	switch (action.action) {
		case 'switch_audio':
			cmd = self.makeCommand(self.SWITCH_AUDIO, opt.input, opt.output);
			break;

		case 'switch_video':
			cmd = self.makeCommand(self.SWITCH_VIDEO, opt.input, opt.output);
			break;
			
		case 'switch_audio_dynamic':
			cmd = self.makeCommand(self.SWITCH_AUDIO, opt.input, opt.output);
			break;

		case 'switch_video_dynamic':
			cmd = self.makeCommand(self.SWITCH_VIDEO, opt.input, opt.output);
			break;
		
		case 'store_setup':
			cmd = self.makeCommand(self.STORE_SETUP, opt.setup, 0 /* STORE */);
			break;

		case 'delete_setup':
			// Not a bug. The command to delete a setup is to store it.
			cmd = self.makeCommand(self.STORE_SETUP, opt.setup, 1 /* DELETE */);
			break;

		case 'recall_setup':
			cmd = self.makeCommand(self.RECALL_SETUP, opt.setup, 0);
			break;

		case 'front_panel':
			cmd = self.makeCommand(self.FRONT_PANEL, opt.status, 0);
			break;

	}

	if (cmd !== undefined) {
		self.send(cmd);
	}

};


/**
 * Formats the command as per the Kramer 2000 protocol.
 * 
 * @param instruction    String or base 10 instruction code for the command
 * @param paramA         String or base 10 parameter A for the instruction
 * @param paramB         String or base 10 parameter B for the instruction
 * @param machine        String or base 10 for the machine to target
 * @returns              The built command to send
 */
instance.prototype.makeCommand = function(instruction, paramA, paramB, machine) {
	let self = this;

	switch (self.config.protocol) {

		case self.PROTOCOL_2000:
			return Buffer.from([
				parseInt(instruction, 10),
				self.MSB + parseInt(paramA  || 0, 10),
				self.MSB + parseInt(paramB  || 0, 10),
				self.MSB + parseInt(machine || 1, 10)
			]);


		case self.PROTOCOL_3000:
			switch (instruction) {

				case self.DEFINE_MACHINE:
					switch (paramA) {

						case self.CAPS_VIDEO_INPUTS:
						case self.CAPS_VIDEO_OUTPUTS:
							// Are combined into one instruction in Protocol 3000
							return "#INFO-IO?\r";

						case self.CAPS_SETUPS:
							return "#INFO-PRST?\r";

					}
					break;

				case self.SWITCH_AUDIO:
					// paramA = inputs
					// paramB = outputs

					if (paramA === '0') {
						paramA = self.getDisconnectParameter();
					}

					if (paramB === '0') {
						// '0' means route to all outputs
						paramB = '*';
					}

					switch (self.config.customizeRoute) {
						case self.ROUTE_ROUTE:
							return `#ROUTE 1,${paramB},${paramA}\r`;

						default:
							self.log('info', 'Audio can only be switched using the #ROUTE command.');
					}

				case self.SWITCH_VIDEO:
					// paramA = inputs
					// paramB = outputs

					if (paramA === '0') {
						paramA = self.getDisconnectParameter();
					}

					if (paramB === '0') {
						// '0' means route to all outputs
						paramB = '*';
					}

					switch (self.config.customizeRoute) {
						case self.ROUTE_ROUTE:
							return `#ROUTE 0,${paramB},${paramA}\r`;

						case self.ROUTE_VID:
						default:
							return `#VID ${paramA}>${paramB}\r`;
					}

				case self.STORE_SETUP:
					return `#PRST-STO ${paramA}\r`;

				case self.DELETE_SETUP:
					self.log('info', 'Deleting presets is not supported on Protocol 3000 matrices.');
					return;

				case self.RECALL_SETUP:
					return `#PRST-RCL ${paramA}\r`;

				case self.FRONT_PANEL:
					return `#LOCK-FP ${paramA}\r`;

			}

			break;

	}

};


/**
 * Difference matrices use different command to issue a disconnect.
 * Return the command appropriate for the user's matrix.
 * 
  * @returns              The parameter to disconnect the output
 */
instance.prototype.getDisconnectParameter = function() {
	let self = this;

	switch (self.config.customizeDisconnect) {
		case self.DISCONNECT_INP1:
			return this.config.inputCount + 1;

		case self.DISCONNECT_0:
		default:
			return '0';

	}

};


instance_skel.extendedBy(instance);
exports = module.exports = instance;
