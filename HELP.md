# Kramer Matrix

This module lets you to control Kramer Matrices using [Protocol 2000 (PDF)](http://k.kramerav.com/downloads/protocols/protocol_2000_rev0_51.pdf). Newer matrices use Protocol 3000 (which this module doesn't currently support), but there's a good chance your matrix can be configured to switch between Protocol 3000 and Protocol 2000.


## Instance Configuration
Configure your matrix with an IP address and to use Protocol 2000 (consult your product manual for details). All connections are made over TCP port 5000.

Enter in the number of inputs, outputs, and presets your matrix supports. The module can auto-detect these settings if you leave those fields empty and apply your changes. Check the log in Companion to confirm the values were correctly detected.


## Actions
### Switch Video
Changes the routing of inputs to outputs.

You can route a specific input to an output, an input to all outputs, or disconnect all outputs.


### Recall Preset
Recalls a stored preset (referred to as a *Setup* in the manual).

Consult your matrix's manual to see how the numbering of the setups compares to physically using the front panel, but here's an example from one of their 6 x 6 matrixes:

![matrix-panel](documentation/images/matrix-panel.png)


### Store Preset
Saves your current inputs and output configuration to a memory preset.


### Delete Preset
Deletes a stored preset.


### Front Panel
Allows you to lock or unlock the matrix's front panel.

Note: a locked front panel doesn't stop Companion from controlling the matrix.
