const {
  UDPHelper,
  TCPHelper  
} = require("@companion-module/base");
const fs = require('fs');
const readline = require('readline');
const p2000 = require('./protocol2000')


module.exports = {
  
  // Internal variables reflecting the state of the matrix
  outputs : [],
  inputs : [],
  selectedSource : '',
  selectedDestination : '',




  /**
   * Returns if the socket is connected.
   */
  isConnected() {
    switch (this.config.connectionProtocol) {
      case p2000.CONNECT_TCP: 
        if (this.socket) { 
          return this.socket.isConnected;
        }
        return false;
        case p2000.CONNECT_UDP:
        return true;
    }
    return false;
  },

  /**
   * Cleanup when the module gets deleted.
   */
  async destroy() {
    this.log("debug", "destroy");

    if (this.socket !== undefined) {
      this.socket.destroy();
      delete this.socket;
    }
  },


  /**
   * Detects the number of inputs/outputs of the matrix.
   *
   * @param detectCapabilities     An array of capabilities to detect from the matrix
   */
  detectCapabilities(detectCapabilities) {
	this.log('debug', 'Detecting Capabilities : ' + detectCapabilities.length);
    // Reset the counter
    this.capabilityWaitingResponsesCounter = 0;

    if (detectCapabilities.length === 0) {
      // No capabilities to detect.
      return;
    }

    for (let i = 0; i < detectCapabilities.length; i++) {
      // Ask the matrix to define its capabilities for anything unknown.
      let cmd = this.makeCommand(p2000.DEFINE_MACHINE, detectCapabilities[i], 1);

      // Increment the counter to show we're waiting for a response from a capability.
      this.capabilityWaitingResponsesCounter++;
	  this.trySendMessage(cmd);
    }
  },

    /**
   * Handles a response from a Protocol 2000 matrix.
   *
   * @param data     The data received from the matrix (ArrayBuffer)
   */
   
  async receivedData2000 (data) {
    // The response to a command returns the first byte with the second most
    //  significant bit on. If we turn that second bit off, we can compare the
    //  first byte of the response to the first byte of the command sent to see
    //  what the response is for.

    let input = data[1] ^ p2000.MSB;
    let output = data[2] ^ p2000.MSB;

    switch (data[0] ^ 64) {
      case p2000.DEFINE_MACHINE:
        // Turn off the MSB to get the actual count of this capability.
        let count = data[2] ^ p2000.MSB;

        // Turn off the MSB of the second byte to see what the capability
        //  response is actually for.
        switch (data[1] ^ p2000.MSB) {
          case this.CAPS_VIDEO_INPUTS:
            this.log("info", `Detected: ${count} inputs.`);
            this.config.inputCount = count.toString();
            break;
            
          case p2000.CAPS_VIDEO_OUTPUTS:
            this.log("info", `Detected: ${count} outputs.`);
            this.config.outputCount = count.toString();
            break;

          case p2000.CAPS_SETUPS:
            this.log("info", `Detected: ${count} presets.`);
            this.config.setupsCount = count.toString();
            break;
            
        }
        
      case p2000.ERROR :
        // Decrement the counter now that it responded. Save the config
        //  if all the requests responded.
        if (--this.capabilityWaitingResponsesCounter === 0) {
          // Update the actions now that the new capabilities have been stored.
		  await this.initRouting();
          this.saveConfig(this.config);
        }
        break;
	  case p2000.REQUEST_VIDEO_STATUS : 
	    // Look for the requested parameter 
		if (this.outBuffer[0] == undefined) {
			this.log('error', "Can't handle response");
			break;
		}
	    output = this.outBuffer[0][2] ^ p2000.MSB;
		input = data[2] ^ p2000.MSB;
      case p2000.SWITCH_VIDEO : {
        let formerInput = this.outputs[output]?.videoSource; 
		if (this.outputs[output] !== undefined) {
          this.outputs[output].videoSource = input; 
		}
	    let index = this.inputs[formerInput]?.videoDestinations?.indexOf(output); 
		  if (index > -1) {
            this.inputs[formerInput].videoDestinations.splice(index, 1);
          }
		this.inputs[input]?.videoDestinations.push(output);
		// Update variables
        this.checkVariables('routing', 'video', output);
        break;
      }
	  
      case p2000.REQUEST_AUDIO_STATUS : 
	    output = this.outBuffer[0][2] ^ p2000.MSB;
		input = data[2] ^ p2000.MSB;
      case p2000.SWITCH_AUDIO : {
        let formerInput = this.outputs[output]?.audioSource;
		if (this.outputs[output] !== undefined) {
          this.outputs[output].audioSource = input;
		}
        let index = this.inputs[formerInput]?.audioDestinations.indexOf(output);
        if (index > -1) {
          this.inputs[formerInput]?.audioDestinations.splice(index, 1);
        }
        this.inputs[input].audioDestinations.push(output);
        this.checkVariables('routing', 'audio', output);
        break;
      }
    }
	this.ackResponse(); 
  },

  /**
   * Handles a response from a Protocol 3000 matrix.
   *
   * @param data     The data received from the matrix (string)
   */
  async receivedData3000(data) {
    // Decrement the counter now that it responded.
    --this.capabilityWaitingResponsesCounter;

    // Response will look like: ~01@COMMAND PARAMETERS
    var response = data.match(/^~\d+@([\w-]+)\s(.*)/);
    if (response === null || response.length !== 3) {
      // Bad response. Log and abort.
      this.log("error", `Error parsing response: ${data}`);
      return;
    }

    switch (response[1]) {
      case "INFO-IO":
        // response[2] will look like: IN 11,OUT 9
        var io = response[2].match(/IN (\d+),OUT (\d+)/);
        if (io === null || io.length !== 3) {
          this.log("error", "Error parsing input/output response.");
        }

        if ((this.config.inputCount == undefined) || (this.config.inputCount == '')) {
          this.log("info", `Detected: ${io[1]} inputs.`);
          this.config.inputCount = parseInt(io[1]);
        }
        if ((this.config.outputCount == undefined) || (this.config.ouputCount == '')) {
          this.log("info", `Detected: ${io[2]} outputs.`);
          this.config.outputCount = parseInt(io[2]);
        }
        break;

      case "INFO-PRST":
        // response[2] will look like: VID 60,AUD 0. Only care about video presets.
        var prst = response[2].match(/VID (\d+)/);
        if (prst === null || prst.length !== 2) {
          this.log("error", "Error parsing presets response.");
        }

        if((this.config.setupsCount == undefined) || (this.config.setupsCount == '')) {
          this.log("info", `Detected: ${prst[1]} presets.`);
          this.config.setupsCount = parseInt(prst[1]);
        }
        break;
    }

    // Save the config if all the requests responded.
    if (this.capabilityWaitingResponsesCounter === 0) {
      // Update the actions now that the new capabilities have been stored.
      await this.initRouting();
      this.initActions();
      this.initVariables();
	  this.initFeedbacks();
      this.saveConfig(this.config);
    }
  },

  /**
     * Formats the command as per the Kramer 2000 protocol.
     *
     * @param instruction    String or base 10 instruction code for the command
     * @param paramA         String or base 10 parameter A for the instruction
     * @param paramB         String or base 10 parameter B for the instruction
     * @param machine        String or base 10 for the machine to target
     * @returns              The built command to send
     */

    makeCommand (instruction, paramA, paramB, machine) {
      switch (this.config.protocol) {
        case p2000.PROTOCOL_2000:
          return Buffer.from([
            parseInt(instruction, 10),
            p2000.MSB + parseInt(paramA || 0, 10),
            p2000.MSB + parseInt(paramB || 0, 10),
            p2000.MSB + parseInt(machine || 1, 10),
          ]);

        case p2000.PROTOCOL_3000:
          switch (instruction) {
            case p2000.DEFINE_MACHINE:
              switch (paramA) {
                case p2000.CAPS_VIDEO_INPUTS:
                case p2000.CAPS_VIDEO_OUTPUTS:
                  // Are combined into one instruction in Protocol 3000
                  return "#INFO-IO?\r";

                case p2000.CAPS_SETUPS:
                  return "#INFO-PRST?\r";
              }
              break;

            case p2000.SWITCH_AUDIO:
              // paramA = inputs
              // paramB = outputs

              if (paramA === "0") {
                paramA = this.getDisconnectParameter();
              }

              if (paramB === "0") {
                // '0' means route to all outputs
                paramB = "*";
              }

              switch (this.config.customizeRoute) {
                case p2000.ROUTE_ROUTE:
                  return `#ROUTE 1,${paramB},${paramA}\r`;

                default:
                  this.log(
                    "info",
                    "Audio can only be switched using the #ROUTE command."
                  );
                  return null;
              }
              break;

            case p2000.SWITCH_VIDEO:
              // paramA = inputs
              // paramB = outputs

              if (paramA === "0") {
                paramA = this.getDisconnectParameter();
              }

              if (paramB === "0") {
                // '0' means route to all outputs
                paramB = "*";
              }

              switch (this.config.customizeRoute) {
                case p2000.ROUTE_ROUTE:
                  return `#ROUTE 0,${paramB},${paramA}\r`;

                case p2000.ROUTE_VID:
                default:
                  return `#VID ${paramA}>${paramB}\r`;
              }
              break;

            case p2000.STORE_SETUP:
              return `#PRST-STO ${paramA}\r`;

            case p2000.DELETE_SETUP:
              this.log(
                "info",
                "Deleting presets is not supported on Protocol 3000 matrices."
              );
              return;

            case p2000.RECALL_SETUP:
              return `#PRST-RCL ${paramA}\r`;

            case p2000.FRONT_PANEL:
              return `#LOCK-FP ${paramA}\r`;
          }

          break;
      }
    },

    /**
     * Difference matrices use different command to issue a disconnect.
     * Return the command appropriate for the user's matrix.
     *
     * @returns              The parameter to disconnect the output
     */
    getDisconnectParameter() {
      switch (this.config.customizeDisconnect) {
        case p2000.DISCONNECT_INP1:
          return parseInt(this.config.inputCount) + 1;

        case p2000.DISCONNECT_0:
        default:
          return "0";
      }
    },
     
  /**
   * Send a command to retrieve status of a specified video output
   * @param {any} output
   */
  requestVideoStatus(output) {
	if (output > 0) {
      let cmd = this.makeCommand(p2000.REQUEST_VIDEO_STATUS, 0, output,1);
      this.trySendMessage(cmd);
	}
    else {
      for (let i = 1; i <= this.config.outputCount; i++) {
        let cmd = this.makeCommand(p2000.REQUEST_VIDEO_STATUS, 0, i,1);
        this.trySendMessage(cmd);
      }
    }
  },
   
  /**
   * Send a command to retrieve status of a specified audio output
   * @param {any} output
   */
  requestAudioStatus(output) {
    if (output > 0) {
      let cmd = this.makeCommand(p2000.REQUEST_AUDIO_STATUS, 0, output,1);
      this.trySendMessage(cmd);
    }
    else {
      for (let i = 1; i <= this.config.outputCount; i++) {
        let cmd = this.makeCommand(p2000.REQUEST_AUDIO_STATUS, 0, i,1);
        this.trySendMessage(cmd);
      }
    }
  },

    /*
    * Load channels name from agn file (Kramer Taylormade)
	* based on module generic readfile
    */
	getAssignations() {
	  let flag = '';
	  let count = 0;
	  let path = this.config.assignations;
	  
	  this.log('debug', 'loading assignations from : ' + path);
	  
	  try {	
			if (!fs.existsSync(path))
			{
				throw new Error('File does not exist');
			}
			
			const fileStream = fs.createReadStream(path, {encoding: 'latin1'});

			const rl = readline.createInterface({
				input: fileStream,
				crlfDelay: Infinity
			});
			
            rl.on('line', (line) => {
				
				let name = line.slice(0,20);
				if (name === '--------------------') {
				  flag = name;
				  return;
				}
				switch (flag) {
				  case 'SOURCES             ' :
				    input = this.inputs[++count];
					if (input) {
                      input.label = name;
					}
				    break;
					
				  case 'DESTINATIONS        ' :
				    output = this.outputs[++count];
					if (output) {
                      output.label = name;
					}
				    break;
					
				  case '--------------------' :
				    flag = name;
					count = 0;
				}
			})
			
			// on end or closing of file builds actions and variables
			rl.on('close', () => {
			  this.initActions();
              this.initVariables();
	          this.initFeedbacks();
			  this.checkVariables('labels');
			});
		
	
		
	  } catch (error) {
		  // on error, goes on building actions and variables with default names
            this.log('error', 'error updating names : ' + error);
			this.initActions();
            this.initVariables();
			this.checkVariables('labels');
	        this.initFeedbacks();
	  };
	  
	  
	},

  
  /** 
   *Initializes the internal routing matrix
   */
  initRouting() {
    let inputCount = Math.min(64, Math.max(1, this.config.inputCount));
    let outputCount = Math.min(64, Math.max(1, this.config.outputCount));
    let setupsCount = Math.min(64, Math.max(0, this.config.setupsCount));

	this.log('debug', 'Initializing internal routing matrix');
	
	this.inputs = [{ id: "0", label: "Off", videoDestinations : [], audioDestinations : [] }]; 
	this.outputs = [{ id: "0", label: 'All', videoSource : '', audioSource : "" }];
    this.setups = [];

	for (let i = 1; i<= inputCount; i++) {
      this.inputs.push({id: i, label : 'Input '+ i, videoDestinations : [], audioDestinations : []});
    }
    for (let i = 1; i<= outputCount; i++) {
      this.outputs.push({id: i, label : 'Output '+ i, videoSource : '', audioSource : ''});
    }
    for (let i = 1; i <= setupsCount; i++) {
    this.setups.push({ id: i, label: `Preset ` + i});
    }
  },
	

  /**
  * Buffers message, then sends it if queue is free.
  */
    trySendMessage(cmd) {
    if (this.outBuffer.push(cmd) == 1) {
      this.sendMessage();
    }
  },

  /**
  *Acknowledges response from device, and send next queued message after timeout.
  */
  ackResponse () {
	clearTimeout(this.timeoutId);
    this.outBuffer?.shift();
	setTimeout(() => {	
      this.attempts = 0;
      this.sendMessage();
	}, this.config.messageTimeout)
  },

  /**
  * Timeout function to handle long waiting state 
  * if tries same message again or discards and send next message if max attempts is reached
  */
  lateResponse() {
	clearTimeout(this.timeoutId);
    if (this.attempts < this.config.maxAttempts) { 
      this.sendMessage();
	}
    else {
        let mes = this.outBuffer[0];
        let hexMes = "";
        for (let i = 0; i<3; i++) {
			hexMes += (mes[i].toString(16) + ',');
		}
		hexMes += mes[3].toString(16);
           
        this.log('error', 'error waiting for message : ' + hexMes);

        // discard capability detection to avoid blocking
        if (--this.capabilityWaitingResponsesCounter === 0) {
            // Update the actions now that the new capabilities have been stored.
            this.initRouting();
            this.saveConfig(this.config);
        }

		this.ackResponse();
	}
  },

    /**
     *Sends next message from output buffer 
     */
  async sendMessage() {
    let cmd = this.outBuffer[0];
    if (cmd) {
      try {
		this.attempts++;

        // logging
        let hexMes = "";
        for (let i = 0; i<3; i++) {
		    hexMes += (cmd[i].toString(16) + ',');
		}
		hexMes += cmd[3].toString(16);
        this.log('debug', 'sending message : ' + hexMes);

		clearTimeout(this.timeoutId);
        this.socket.send(cmd);
		this.timeoutId = setTimeout(() => {
			this.lateResponse();
		  }, 
		  this.config.responseTimeout
		);
	  }
	  catch (error) {
          this.log("error", `${error}`);
      }
    }
  },
  
    /**
    * Connect to the matrix over TCP or UDP.
    */
  async initConnection() {
    this.log ('debug', 'Connection pending');
    this.PromiseConnected = null;
    this.outBuffer = [];
    this.attempts = 0;
    	   
    if (this.socket !== undefined) {
		this.log ('debug', 'socket exists');
        await this.socket.destroy();
        delete this.socket;
    }

    if (!this.config.host) {
        this.log('error', 'No host specified')
        this.updateStatus("bad_config");
        return;
    }
	
    this.updateStatus("connecting");

      this.PromiseConnected = new Promise((resolve, reject) => {
          switch (this.config.connectionProtocol) {
              case p2000.CONNECT_TCP:
                  this.socket = new TCPHelper(this.config.host, parseInt(this.config.port), {
                      reconnect_interval: 5000
                  });
                  break;

              case p2000.CONNECT_UDP:
                  this.socket = new UDPHelper(this.config.host, this.config.port);
                  this.updateStatus("ok");
                  this.log("debug", "Connected (UDP)");
                  break;

              default:
                  this.updateStatus("connection_failure", 'Invalid connection protocol')
                  this.log('error', 'Invalid connection protocol')
                  reject()
          }

          this.socket.on("error", (err) => {
              if (this.currentStatus !== "error") {
                  // Only log the error if the module isn't already in this state.
                  // This is to prevent spamming the log during reconnect failures.
                  this.updateStatus("connection_failure", err.message);
                  this.log("error", 'Network error: ' + err.message);
              }
              reject(err);
          });

          this.socket.on("connect", () => {
              // This event only fires for TCP connections.
              this.updateStatus("ok");
              this.log("debug", "Connected (TCP)");
              resolve();
          });

          if (this.config.connectionProtocol === p2000.CONNECT_UDP) {
              // Auto-resolve the promise if this is a UDP connection.
              resolve();
          }
        });

      this.PromiseConnected.then(() => {
          this.socket.on("status_change", (status, message) => {
              this.updateStatus(status, message);
          });

          this.socket.on("data", async (data) => {
              // Note: 'data' is an ArrayBuffer
              if (typeof data !== "object" || data.length < 4) {
                  // Unknown or invalid response
                  return;
              }

              // Parses response and select appropriate protocol to decode
              switch (this.config.protocol) {
                  case p2000.PROTOCOL_2000:
                      let chunk = data.slice(0, 4);
                      if (chunk[0] < p2000.MSB) {
                          let cmdstring = '';
                          for (let i = 0; i < 4; i++) {
                              cmdstring += (Number(chunk[i]) + ',');
                          }
                          this.log('debug', 'Received Protocol 2000 data : ' + cmdstring);
                          this.receivedData2000(chunk);
                      }
                      break;

                  case p2000.PROTOCOL_3000:
                      // data may come in as a multiline response to the request. Handle
                      //  each line separately.
                      this.log('debug', 'Received Protocol 3000 data : ' + data);
                      data = data.toString().split("\r\n");

                      for (var i = 0; i < data.length; i++) {
                          if (data[i].length !== 0) {
                              this.receivedData3000(data[i]);
                          }
                      }
                      break;
              }
              this.checkFeedbacks();
          });
      }).catch(() => {
        // Error while connecting. The error message is already logged, but Node requires
        //  the rejected promise to be handled.
      });

      
  },


}
