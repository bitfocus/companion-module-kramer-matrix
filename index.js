
const {
    InstanceBase,
    UDPHelper,
    TCPHelper,
    runEntrypoint,
} = require('@companion-module/base');

const actions = require('./src/actions');
const api = require('./src/api');
const variables = require('./src/variables');
const configFields = require('./src/configFields');
const feedbacks = require('./src/feedbacks');
const upgradeScripts = require('./src/upgrades')
const p2000 = require('./src/protocol2000')

const simpleEval = require('simple-eval').default;

class KramerInstance extends InstanceBase {
  
  constructor(internal) {
    super(internal);
    
    // Assign the methods from the listed files to this class
    Object.assign(this, {
    ...configFields,
    ...api,
    ...actions,
    ...variables,
    ...feedbacks,
    //...presets,
                });
				
  }



  // A promise that's resolved when the socket connects to the matrix.
  PromiseConnected = null;

  // A buffer for outgoing messages 
  outBuffer = [];

  // The number of capabilities we're waiting responses for before saving the config.
  capabilityWaitingResponsesCounter = 0;
  

  /**
   * Initializes the module
   */
  async init(config) {
    this.log('debug', 'Initialization');
    this.config = config;
    this.updateStatus("ok");

    await this.configUpdated(this.config);
  }

  /**
   * The user updated the config.
   *
   * @param config         The new config object
   */
  async configUpdated(config) {
	  this.log('debug', 'Updating config');
    // Reconnect to the matrix if the IP, port or protocol changed
    if (
      this.config.host !== config.host || 
      this.config.port !== config.port || 
      this.config.connectionProtocol !== config.connectionProtocol || 
      this.isConnected() === false
    ) {
      // Have to set the new host IP/protocol before making the connection.
      this.config.host = config.host;
      this.config.port = config.port;
      this.config.connectionProtocol = config.connectionProtocol;
      this.log ('debug', 'Reconnecting');
      await this.initConnection();
    }
    else {
      this.log('debug', 'Connection unchanged');
    }
    this.config = config;
	
    // If any of the values are '0' then attempt to auto-detect:
    let detectCapabilities = [];
    if ((this.config.inputCount == undefined) || (this.config.inputCount == '')) {
        detectCapabilities.push(p2000.CAPS_VIDEO_INPUTS);
    }
    if ((this.config.outputCount == undefined) || (this.config.outputCount == '')) {
      detectCapabilities.push(p2000.CAPS_VIDEO_OUTPUTS); 
    }
    if ((this.config.setupsCount == undefined) || (this.config.setupsCount == '')) {
      detectCapabilities.push(p2000.CAPS_SETUPS);
    }

    if (this.PromiseConnected !== null) {
      this.PromiseConnected.then(() => {
		if (detectCapabilities.length !== 0) {
          // Once connected, check the capabilities of the matrix if needed.
          this.detectCapabilities(detectCapabilities);
		}
		// Initializes the internal matrix
        this.initRouting();
		// Get channels name and then build actions & variables
		this.getAssignations();
	    this.requestVideoStatus();
		if (!this.config.disableAudio) {
          this.requestAudioStatus();
		}
     },() => { 
 //      this.initRouting();
//	   this.getAssignations();
 //     }).catch((_) => {
 //         console.log('bizarre')
          // Error while connecting. The error message is already logged, but Node requires
          //  the rejected promise to be handled.
      });
    }
    
    else {   
      this.initRouting();
	  this.getAssignations();
    }

  }
}


runEntrypoint(KramerInstance, [upgradeScripts.configUpdate]);