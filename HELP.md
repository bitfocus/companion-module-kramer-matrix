# Kramer Matrix (Protocol 2000)

This module allows you to control Kramer Matrices using their [Protocol 2000](http://k.kramerav.com/downloads/protocols/protocol_2000_rev0_51.pdf). The newer matrices use Protocol 3000 (which this module doesn't currently support), but there's a good chance your matrix can switch between Protocol 3000 and Protocol 2000.


## Instance Configuration
Configure your matrix with an IP address and to use Protocol 2000 (consult your product manual for details). Protocol 2000 connects using TCP port 5000.

Enter in the number of inputs, outputs, and presets your matrix supports. The module can auto-detect these settings if you leave those fields empty and apply your changes. Check the log in Companion to confirm the values were correctly detected.


## Actions
### Switch Video
Routes a specific input to an output, an input to all outputs, or disconnects all outputs.


### Recall Preset
Recalls a stored preset.

On the VS66-HDCP matrix, the memory presets are numbered this way:

![matrix-panel](documentation/images/matrix-panel.png)
*(when looking at the front of the matrix)*


### Store Preset
Saves your current inputs and outputs to a memory preset.


### Delete Preset
Deletes a stored preset.


### Front Panel
Allows the front panel to be locked or unlocked.
