module.exports = {

  
  /**
   * Creates variables.
   */
  
  initVariables() {
	this.log ('debug', 'Initializing variables');
    let variables = [];

    variables.push({ variableId : 'selectedSource', name : 'Selected source'});  
    variables.push({ variableId : 'selectedDestination', name : 'Selected destination'});  
    variables.push({ variableId : 'selectedSourceLabel', name : 'Selected source label'});  
    variables.push({ variableId : 'selectedDestinationLabel', name : 'Selected destination label'});  

    // Set some sane minimum/maximum values on the capabilities
    let inputCount = Math.min(64, this.config.inputCount);
    let outputCount = Math.min(64, this.config.outputCount);
    let setupsCount = Math.min(64, this.config.setupsCount);

    for (let i = 1; i <= outputCount; i++) {
      variables.push({ variableId : 'Output_'+ i + '_video_source', name : 'Output #' + i + ' video source'});  
      variables.push({ variableId : 'Output_'+ i + '_audio_source', name : 'Output #' + i + ' audio source'});  
      variables.push({ variableId : 'Output_'+ i + '_label', name : 'Output #' + i + ' label'});  
    }

    for (let i = 1; i <= inputCount; i++) { 
      variables.push({ variableId : 'Input_' + i + '_label', name : 'Input #' + i + ' label'});
      variables.push({ variableId : 'Input_' + i + '_video_destinations', name : 'Input #' + i + ' video destinations'});
      variables.push({ variableId : 'Input_' + i + '_audio_destinations', name : 'Input #' + i + ' audio destinations'});
    }
    this.setVariableDefinitions(variables);
  },


  /*
   * Sets variables values
   */

  checkVariables(category, type, destination) { 
    let variableValues = {};
    switch (category) {
      case 'routing' :
        if (type == 'video' || type == 'audio') {
          if (destination > 0 && this.outputs[destination] !== undefined) {
            variableValues['Output_' + destination + '_' + type + '_source'] = this.outputs[destination][type+'Source']; 
			//if (this.outputs[destination]) {
			//	variableValues['Input_' + this.outputs[destination][type+'Source'] + '_' + type + '_destinations'] = this.inputs[this.outputs[destination][type + 'Source']][type+'Destinations'].toString();
            //}
			let inputCount = this.inputs.length;
			for (i = 1; i < inputCount; i++) {
				if (this.inputs[i] !== undefined) {
                  variableValues['Input_' + i + '_' + type + '_destinations'] = this.inputs[i][type+'Destinations']?.toString();
				}
            }
		  }
          else {
            let outputCount = this.outputs.length;
            for (i = 1; i < outputCount; i++) {
			  if (this.outputs[i] !== undefined) {
                variableValues['Output_' + i + '_' + type + '_source'] = this.outputs[i][type+'Source'];
			  }
			}
			let inputCount = this.inputs.length;
			for (i = 1; i < inputCount; i++) {
				if (this.inputs[i] !== undefined) {
				  variableValues['Input_' + i + '_' + type + '_destinations'] = this.inputs[i][type+'Destinations']?.toString();
				}
            }
          }
        }
        else {
          this.checkVariables('routing', 'video', destination);
          this.checkVariables('routing', 'audio', destination);
        }
        break;
      case 'selection' :
        variableValues['selectedSource'] = this.selectedSource;
        variableValues['selectedDestination'] = this.selectedDestination;
		variableValues['selectedSourceLabel'] = this.inputs[this.selectedSource]?.label;
		variableValues['selectedDestinationLabel'] = this.outputs[this.selectedDestination]?.label;

        break;
		
	  case 'labels' :
	    this.inputs.forEach((input) => {
		variableValues['Input_' + input.id + '_label'] = input.label;
		});
		this.outputs.forEach((output) => {
		variableValues['Output_' + output.id + '_label'] = output.label;
		});
		
		break;

      default : 
        this.checkVariables('routing');
        this.checkVariables('selection');
		this.checkVariables('labels');
    }

    if (Object.keys(variableValues).length > 0) {
      this.setVariableValues(variableValues);
    }
  }
  
}