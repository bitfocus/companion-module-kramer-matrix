var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	let self = this;

	// Decimal codes for the instructions supported by Kramer Matrix (Protocol 2000).
	// See https://kramerav.com/support/download.asp?f=35567
	// See https://kramerav.com/downloads/protocols/protocol_2000_rev0_51.pdf
	self.SWITCH_VIDEO   =  1;
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

	// The most significant bit for bytes 2-4 must be 1. Adding 128 to each of those
	//  bytes accomplishes this.
	self.MSB = 128;

	// A promise that's resolved when the socket connects to the matrix.
	self.PromiseConnected = null;

	// The number of capabilities we're waiting responses for before saving the config.
	self.capabilityWaitingResponsesCounter = 0;

	// super-constructor
	instance_skel.apply(this, arguments);
	
	self.actions();

	return self;

};


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

	// Reconnect to the matrix if the IP changed
	if (self.config.host !== config.host || self.isConnected() === false) {
		// Have to set the new host IP before making the connection.
		self.config.host = config.host;
		self.init_tcp();
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

	self.init_tcp();

};


/**
 * Connect to the matrix over TCP port 5000.
 */
instance.prototype.init_tcp = function() {
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

		// Don't try to reconnect automatically. A new connection will be made when
		//  a command is sent. We never receive anything unsolicited.
		self.socket = new tcp(self.config.host, 5000, { reconnect_interval:5000 });

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
			self.status(self.STATUS_OK);
			debug('Connected');
			resolve();
		})

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

	});

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
	return self.socket !== undefined && self.socket.connected;
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
			value: "This module only works with Kramer matrices using Protocol 2000 and does not " +
					"support Protocol 3000 devices, however some Kramer matrices can be configured " +
					"to use either protocol.<br><br>" +
					"Please consult your product's manual for compatibility details."
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 6,
			regex: self.REGEX_IP
		},
		{
			type: 'dropdown',
			id: 'protocol',
			label: 'Protocol',
			default: self.PROTOCOL_2000,
			width: 4,
			choices: [
				{ id: self.PROTOCOL_2000, label: 'Protocol 2000' }
				// Future: { id: self.PROTOCOL_3000, label: 'Protocol 3000' }
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
			label: 'Input Count',
			default: '',
			width: 2,
			regex: '/^\\d*$/'
		},
		{
			type: 'textinput',
			id: 'outputCount',
			label: 'Output Count',
			default: '',
			width: 2,
			regex: '/^\\d*$/'
		},
		{
			type: 'textinput',
			id: 'setupsCount',
			label: 'Preset Count',
			default: '',
			width: 2,
			regex: '/^\\d*$/'
		}
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
						{ id: '0', label: 'Panel Unlocked' },
						{ id: '1', label: 'Panel Locked' },
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
	let opt = action.options;
	let cmd = undefined;

	switch (action.action) {

		case 'switch_video':
			cmd = self.makeCommand(self.SWITCH_VIDEO, opt.input, opt.output);
			break;

		case 'store_setup':
			cmd = self.makeCommand(self.STORE_SETUP, opt.setup, 0 /* STORE */);
			break;

		case 'delete_setup':
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
				self.MSB + parseInt(machine || 1, 10),
				0x0a  // End with a \r to separate multiple commands
			]);

		case self.PROTOCOL_3000:
			// Future when someone has access to develop against a Protocol 3000 matrix.

	}

};


instance_skel.extendedBy(instance);
exports = module.exports = instance;
