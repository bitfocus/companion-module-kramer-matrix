const simpleEval = require('simple-eval').default;
const p2000 = require('./protocol2000')

module.exports = {
	  
    /**
   * Creates the actions for this module.
   */
  initActions() {
	let self = this;
	self.log('debug', 'Initializing actions');

    let inputOpts = self.inputs;
    let outputOpts = self.outputs;
    let setups = self.setups;

    self.setActionDefinitions({
		
		
      select_output: {
        name: "Select output",
		options : [
		  {
            type: "dropdown",
            label: "Output #",
            id: "output",
            default: "0",
            choices: outputOpts,
          },
        ],
        callback: async (event) => {
		  self.selectedDestination = event.options.output;
		  self.checkVariables ('selection');
		  self.checkFeedbacks('selected_destination', 'selected_destination_dyn', 'selected_output_source', 'selected_output_source_dyn', 'take');
		}
	  },
		
	  select_output_dynamic: {
        name: "Select output (dynamic)",
		options : [
		  {
            type: "textinput",
            useVariables: {local : true},
            label: "Output #",
            id: "output",
            default: "0",
          },
        ],
        callback: async (event, context) => {
		  const output = simpleEval(await context.parseVariablesInString(event.options.output));
		  self.selectedDestination = output;
		  self.checkVariables ('selection');
		  self.checkFeedbacks('selected_destination', 'selected_destination_dyn', 'selected_output_source', 'selected_output_source_dyn', 'take');
		}
	  },
				
      select_input: {
        name: "Select input",
		options : [
		  {
            type: "dropdown",
            label: "input #",
            id: "input",
            default: "0",
            choices: inputOpts,
          },
        ],
        callback: async (event) => {
		  self.selectedSource = event.options.input;
		  self.checkVariables ('selection');
		  self.checkFeedbacks('selected_source', 'selected_source_dyn', 'take');
		}
	  },
		
	  select_input_dynamic: {
        name: "Select input (dynamic)",
		options : [
		  {
            type: "textinput",
            useVariables: {local : true},
            label: "input #",
            id: "input",
            default: "0",
          },
        ],
        callback: async (event, context) => {
		  const input = simpleEval(await context.parseVariablesInString(event.options.input));
		  self.selectedSource = input;
		  self.checkVariables ('selection');
  		  self.checkFeedbacks('selected_source', 'selected_source_dyn', 'take');

		}
	  },
			
			
		
      request_audio: {
        name: "Request Audio Source routed to destination",
        options: [
          {
            type: "dropdown",
            label: "Output #",
            id: "output",
            default: "0",
            choices: outputOpts,
          },
        ],
        callback: async (event) => {
		  self.requestAudioStatus(event.options.output);
        },
      },
	
      requestAudioDynamic: {
        name: "Request Audio Source routed to destination (dynamic)",
        options: [
          {
            type: "textinput",
            useVariables: {local : true},
            label: "Output #",
            id: "output",
            default: "0",
          },
        ],
        callback: async (event, context) => {
          const output = simpleEval(await context.parseVariablesInString(event.options.output));
          self.requestAudioStatus(output);
        },
      },
	  
      request_video: {
        name: "Request Video Source routed to destination",
        options: [
          {
            type: "dropdown",
            label: "Output #",
            id: "output",
            default: "0",
            choices: outputOpts,
          },
        ],
        callback: async (event) => {
		  self.requestVideoStatus(event.options.output);
        },
      },
	  	
      request_video_dynamic: {
        name: "Request Video Source routed to destination (dynamic)",
        options: [
          {
            type: "textinput",
            useVariables: {local : true},
            label: "Output #",
            id: "output",
            default: "0",
          },
        ],
        callback: async (event, context) => {
          const output = simpleEval(await context.parseVariablesInString(event.options.output)
          );
          self.requestVideoStatus(output);
        },
      },
	  
	  
      switch_audio: {
        name: "Switch Audio",
        options: [
          {
            type: "dropdown",
            label: "Input #",
            id: "input",
            default: "0",
            choices: inputOpts,
          },
          {
            type: "dropdown",
            name: "Output #",
            id: "output",
            default: "0",
            choices: outputOpts,
          },
        ],
        callback: async (event) => {
          let cmd = self.makeCommand(
            self.SWITCH_AUDIO,
            event.options.input,
            event.options.output
          );
		 
		 self.trySendMessage(cmd);
		},
      },
	  
      switch_video: {
        name: "Switch Video",
        options: [
          {
            type: "dropdown",
            label: "Input #",
            id: "input",
            default: "0",
            choices: inputOpts,
          },
          {
            type: "dropdown",
            name: "Output #",
            id: "output",
            default: "0",
            choices: outputOpts,
          },
        ],
        callback: async (event) => {
          let cmd = self.makeCommand(
            self.SWITCH_VIDEO,
            event.options.input,
            event.options.output
          );
		  self.trySendMessage(cmd);
        },
      },
	  
      switch_video_dynamic: {
        name: "Switch Video (Dynamic)",
        options: [
          {
            type: "textinput",
            useVariables: {local : true},
            label: "Input #",
            id: "input",
            default: "0",
          },
          {
            type: "textinput",
            useVariables: {local : true},
            label: "Output #",
            id: "output",
            default: "0",
          },
        ],
        callback: async (event, context) => {
		  const input = simpleEval(await context.parseVariablesInString(event.options.input));
		  const output = simpleEval(await context.parseVariablesInString(event.options.output));
          let cmd = self.makeCommand(self.SWITCH_VIDEO, input, output);
		  self.trySendMessage(cmd);
        },
      },

	  
      switch_inputs: {
        name: "Replace video input A by video input B",
        options: [
          {
            type: "dropdown",
            label: "Input A #",
            id: "inputA",
            default: "0",
            choices: inputOpts,
          },
          {
            type: "dropdown",
            name: "Input B #",
            id: "inputB",
            default: "0",
            choices: inputOpts,
          },
        ],
        callback: async (event) => {
		  let outputsList = self.inputs[event.options.inputA]?.videoDestinations?.map((x) => x);
		  self.log('debug', 'routing input '+ event.options.inputB + ' to outputs ' + outputsList);
		  outputsList.forEach((output) => {
            let cmd = self.makeCommand(
              self.SWITCH_VIDEO,
              event.options.inputB,
              output
            );
            self.trySendMessage(cmd);
		  });
        },
      },
	  
      switch_inputs_dynamic: {
        name: "Replace video input A by video input B (Dynamic)",
        options: [
          {
            type: "textinput",
            useVariables: {local : true},
            label: "Input A #",
            id: "inputA",
            default: "0",
          },
          {
            type: "textinput",
            useVariables: {local : true},
            label: "Input B #",
            id: "inputB",
            default: "0",
          },
        ],
        callback: async (event, context) => {
		  const inputA = simpleEval(await context.parseVariablesInString(event.options.inputA));
		  const inputB = simpleEval(await context.parseVariablesInString(event.options.inputB));
		  let outputsList = self.inputs[inputA]?.videoDestinations?.map((x) => x);
		  self.log('debug', 'routing input '+ inputB + ' to outputs ' + outputsList);
		  outputsList.forEach((output) => {
            let cmd = self.makeCommand(self.SWITCH_VIDEO, inputB, output);
            self.trySendMessage(cmd);
		  })
        },
      },



      switch_audio_dynamic: {
        name: "Switch Audio (Dynamic)",
        options: [
          {
            type: "textinput",
            useVariables: {local : true},
            label: "Input #",
            id: "input",
            default: "0",
            regex: "/^\\d*$/",
          },
          {
            type: "textinput",
            useVariables: {local : true},
            label: "Output #",
            id: "output",
            default: "0",
            regex: "/^\\d*$/",
          },
        ],
        callback: async (event, context) => {
		  const input = simpleEval(await context.parseVariablesInString(event.options.input));
		  const output = simpleEval(await context.parseVariablesInString(event.options.output));

          let cmd = self.makeCommand(self.SWITCH_AUDIO, input, output);
		  self.trySendMessage(cmd);
        },
      },

      recall_setup: {
        name: "Recall Preset",
        options: [
          {
            type: "dropdown",
            label: "Preset",
            id: "setup",
            default: "1",
            choices: setups,
          },
        ],
        callback: async (event) => {
          let cmd = self.makeCommand(self.RECALL_SETUP, event.options.setup, 0);
		  self.trySendMessage(cmd);
        },
      },

      store_setup: {
        name: "Store Preset",
        options: [
          {
            type: "dropdown",
            label: "Preset",
            id: "setup",
            default: "1",
            choices: setups,
          },
        ],
        callback: async (event) => {
          let cmd = self.makeCommand(
            self.STORE_SETUP,
            event.options.setup,
            0 /* STORE */
          );
		  self.trySendMessage(cmd);
        },
      },

      delete_setup: {
        name: "Delete Preset",
        options: [
          {
            type: "dropdown",
            label: "Preset",
            id: "setup",
            default: "1",
            choices: setups,
          },
        ],

        callback: async (event) => {
          // Not a bug. The command to delete a setup is to store it.
          let cmd = self.makeCommand(
            self.STORE_SETUP,
            event.options.setup,
            1 /* DELETE */
          );
		  self.trySendMessage(cmd);
        },
      },

      front_panel: {
        name: "Front Panel Lock",
        options: [
          {
            type: "dropdown",
            label: "Status",
            id: "status",
            default: "0",
            choices: [
              { id: "0", label: "Unlock" },
              { id: "1", label: "Lock" },
            ],
          },
        ],
        callback: async (event) => {
          let cmd = self.makeCommand(self.FRONT_PANEL, event.options.status, 0);
		  self.trySendMessage(cmd);
        },
      },
	  
	  take: {
        name: "Take",
		options: [
		  {
		    type : "dropdown",
		    label: "Audio , Video or Both",
		    id: "type",
		    default: "0",
		    choices: [
		      {id: "0", label: "Audio & Video" },
			  {id: self.SWITCH_VIDEO, label: "Video"},
			  {id: self.SWITCH_AUDIO, label: "Audio" }
            ]
		  }
	    ],
	    callback: async (event) => {
		  if (self.selectedDestination == "") {
		    return;
		  }
		  switch (event.options.type) {
            case "0" : {
			  if (self.selectedSource > 0) {
		        let cmd = self.makeCommand(self.SWITCH_AUDIO, self.selectedSource, self.selectedDestination);
		        self.selectedSource = "";
		        self.trySendMessage(cmd);
			  }
			}
			case self.SWITCH_VIDEO : {
			  if (self.selectedSource > 0) {
			    let cmd = self.makeCommand(self.SWITCH_VIDEO, self.selectedSource, self.selectedDestination);
		        //self.selectedSource = "";
		        //self.selectedDestination = "";
		        self.trySendMessage(cmd);
			    }
			  break;
			}
			case self.SWITCH_AUDIO : {
			  if (self.selectedSource > 0) {
		        let cmd = self.makeCommand(self.SWITCH_AUDIO, self.selectedSource, self.selectedDestination);
		        //self.selectedSource = "";
		        //self.selectedDestination = "";
                self.trySendMessage(cmd);
			  }
			}
		  }
		  self.checkVariables("selection");
		  self.checkFeedbacks('selected_destination', 'selected_destination_dyn', 'selected_source', 'selected_source_dyn', 'selected_output_source', 'selected_output_source_dyn', 'take');
		}
    },
	
	  clear: {
        name : "Clear",
		options: [],
	    callback: async (event) => {
		  self.selectedSource = "";
		  self.selectedSource = "";
		  self.selectedDestination = "";
		  self.checkVariables("selection");
		  self.checkFeedbacks('selected_destination', 'selected_destination_dyn', 'selected_source', 'selected_source_dyn', 'selected_output_source', 'selected_output_source_dyn', 'take');
		}
    }
  });
  }
}