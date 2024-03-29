const {
  InstanceBase,
  Regex,
  runEntrypoint,
  UDPHelper,
  TCPHelper,
} = require(
  "@companion-module/base",
);

class KramerInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
  }

  // Decimal codes for the instructions supported by Kramer Matrix (Protocol 2000).
  // See https://kramerav.com/support/download.asp?f=35567
  // See https://kramerav.com/downloads/protocols/protocol_2000_rev0_51.pdf
  SWITCH_VIDEO = 1;
  SWITCH_AUDIO = 2;
  STORE_SETUP = 3;
  RECALL_SETUP = 4;
  FRONT_PANEL = 30;
  DEFINE_MACHINE = 62;

  CAPS_VIDEO_INPUTS = 1;
  CAPS_VIDEO_OUTPUTS = 2;
  CAPS_SETUPS = 3;

  //  Define the protocols this module may support:
  PROTOCOL_2000 = "2000";
  PROTOCOL_3000 = "3000";

  //  Define the connection protocols this module will use:
  CONNECT_TCP = "TCP";
  CONNECT_UDP = "UDP";

  // Define the possible Protocol 3000 commands to route video:
  ROUTE_ROUTE = "ROUTE";
  ROUTE_VID = "VID";

  // Define the possible parameters to disconnect an output:
  DISCONNECT_0 = "0";
  DISCONNECT_INP1 = "+1";

  // Protocol 2000: The most significant bit for bytes 2-4 must be 1. Adding 128 to
  //  each of those bytes accomplishes this.
  MSB = 128;

  // A promise that's resolved when the socket connects to the matrix.
  PromiseConnected = null;

  // The number of capabilities we're waiting responses for before saving the config.
  capabilityWaitingResponsesCounter = 0;

  /**
   * Initializes the module and try to detect capabilities.
   */
  async init(config) {
    this.config = config;
    this.updateStatus("ok");
    this.actions();

    // TODO: Convert this to the new upgrade infrastructure!
    //
    let configUpgraded = false;

    // These config options were adding in version 1.2.0 of this module.
    // Set the defaults if not set:

    if (this.config.connectionProtocol === undefined) {
      this.config.connectionProtocol = this.CONNECT_TCP;
      configUpgraded = true;
    }

    if (this.config.customizeRoute === undefined) {
      this.config.customizeRoute = this.ROUTE_VID;
      configUpgraded = true;
    }

    if (this.config.customizeDisconnect === undefined) {
      this.config.customizeDisconnect = this.DISCONNECT_0;
      configUpgraded = true;
    }

    if (configUpgraded) {
      this.saveConfig(this.config);
    }

    this.init_connection();
  }

  /**
   * The user updated the config.
   *
   * @param config         The new config object
   */
  async configUpdated() {
    // Convert to a number. Convert to 0 if empty.
    config.inputCount = parseInt(config.inputCount || 0);
    config.outputCount = parseInt(config.outputCount || 0);
    config.setupsCount = parseInt(config.setupsCount || 0);

    // Reconnect to the matrix if the IP or protocol changed
    if (
      this.config.host !== config.host || this.isConnected() === false ||
      this.config.connectionProtocol !== config.connectionProtocol
    ) {
      // Have to set the new host IP/protocol before making the connection.
      this.config.host = config.host;
      this.config.connectionProtocol = config.connectionProtocol;
      this.init_connection();
    }

    // Update the rest of the config
    this.config = config;

    // If any of the values are '0' then attempt to auto-detect:
    let detectCapabilities = [];
    if (config.inputCount === 0) {
      detectCapabilities.push(this.CAPS_VIDEO_INPUTS);
    }
    if (config.outputCount === 0) {
      detectCapabilities.push(this.CAPS_VIDEO_OUTPUTS);
    }
    if (config.setupsCount === 0) {
      detectCapabilities.push(this.CAPS_SETUPS);
    }

    if (this.PromiseConnected) {
      this.PromiseConnected.then(() => {
        // Once connected, check the capabilities of the matrix if needed.
        this.detectCapabilities(detectCapabilities);
      }).catch((err) => {
        // Error while connecting. The error message is already logged, but Node requires
        //  the rejected promise to be handled.
      });
    }

    // Rebuild the actions to reflect the capabilities we have.
    this.actions();
  }

  /**
   * Detects the number of inputs/outputs of the matrix.
   *
   * @param detectCapabilities     An array of capabilities to detect from the matrix
   */
  detectCapabilities(detectCapabilities) {
    // Reset the counter
    this.capabilityWaitingResponsesCounter = 0;

    if (detectCapabilities.length === 0) {
      // No capabilities to detect.
      return;
    }

    for (let i = 0; i < detectCapabilities.length; i++) {
      // Ask the matrix to define its capabilities for anything unknown.
      let cmd = this.makeCommand(this.DEFINE_MACHINE, detectCapabilities[i], 1);

      // Increment the counter to show we're waiting for a response from a capability.
      this.capabilityWaitingResponsesCounter++;
      this.send(cmd);
    }
  }

  /**
   * Connect to the matrix over TCP port 5000 or UDP port 50000.
   */
  init_connection() {
    if (this.socket !== undefined) {
      this.socket.destroy();
      delete this.socket;
    }

    if (!this.config.host) {
      return;
    }

    this.updateStatus("connecting");

    this.PromiseConnected = new Promise((resolve, reject) => {
      switch (this.config.connectionProtocol) {
        case this.CONNECT_TCP:
          this.socket = new TCPHelper(this.config.host, 5000, {
            reconnect_interval: 5000,
          });
          break;

        case this.CONNECT_UDP:
          this.socket = new UDPHelper(this.config.host, 50000);
          this.updateStatus("ok");
          this.log("debug", "Connected (UDP)");
          break;
      }

      this.socket.on("error", (err) => {
        if (this.currentStatus !== "error") {
          // Only log the error if the module isn't already in this state.
          // This is to prevent spamming the log during reconnect failures.
          this.log("debug", "Network error", err);
          this.updateStatus("connection_failure", err);
          this.log("error", `Network error: ${err.message}`);
        }

        reject(err);
      });

      this.socket.on("connect", () => {
        // This event only fires for TCP connections.
        this.updateStatus("ok");
        this.log("debug", "Connected (TCP)");
        resolve();
      });

      if (this.config.connectionProtocol === this.CONNECT_UDP) {
        // Auto-resolve the promise if this is a UDP connection.
        resolve();
      }
    }).catch((err) => {
      // The error is already logged, but Node requires all rejected promises to be caught.
    });

    this.socket.on("status_change", (status, message) => {
      this.updateStatus(status, message);
    });

    this.socket.on("data", (data) => {
      // Note: 'data' is an ArrayBuffer

      if (typeof data !== "object" || data.length < 4) {
        // Unknown or invalid response
        return;
      }

      switch (this.config.protocol) {
        case this.PROTOCOL_2000:
          this.receivedData2000(data);
          break;

        case this.PROTOCOL_3000:
          // data may come in as a multiline response to the request. Handle
          //  each line separately.
          data = data.toString().split("\r\n");

          for (var i = 0; i < data.length; i++) {
            if (data[i].length !== 0) {
              this.receivedData3000(data[i]);
            }
          }
          break;
      }
    });
  }

  /**
   * Handles a response from a Protocol 2000 matrix.
   *
   * @param data     The data received from the matrix (ArrayBuffer)
   */
  receivedData2000(data) {
    // The response to a command returns the first byte with the second most
    //  significant bit on. If we turn that second bit off, we can compare the
    //  first byte of the response to the first byte of the command sent to see
    //  what the response is for.
    switch (data[0] ^ 64) {
      case this.DEFINE_MACHINE:
        // Turn off the MSB to get the actual count of this capability.
        let count = data[2] ^ this.MSB;

        // Turn off the MSB of the second byte to see what the capability
        //  response is actually for.
        switch (data[1] ^ this.MSB) {
          case this.CAPS_VIDEO_INPUTS:
            this.log("info", `Detected: ${count} inputs.`);
            this.config.inputCount = count;
            break;

          case this.CAPS_VIDEO_OUTPUTS:
            this.log("info", `Detected: ${count} outputs.`);
            this.config.outputCount = count;
            break;

          case this.CAPS_SETUPS:
            this.log("info", `Detected: ${count} presets.`);
            this.config.setupsCount = count;
            break;
        }

        // Decrement the counter now that it responded. Save the config
        //  if all the requests responded.
        if (--this.capabilityWaitingResponsesCounter === 0) {
          // Update the actions now that the new capabilities have been stored.
          this.actions();
          this.saveConfig(this.config);
        }
        break;
    }
  }

  /**
   * Handles a response from a Protocol 3000 matrix.
   *
   * @param data     The data received from the matrix (string)
   */
  receivedData3000(data) {
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

        if (this.config.inputCount === 0) {
          this.log("info", `Detected: ${io[1]} inputs.`);
          this.config.inputCount = parseInt(io[1]);
        }
        if (this.config.outputCount === 0) {
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

        if (this.config.setupsCount === 0) {
          this.log("info", `Detected: ${prst[1]} presets.`);
          this.config.setupsCount = parseInt(prst[1]);
        }
        break;
    }

    // Save the config if all the requests responded.
    if (this.capabilityWaitingResponsesCounter === 0) {
      // Update the actions now that the new capabilities have been stored.
      this.actions();
      this.saveConfig(this.config);
    }
  }

  /**
   * Sends the command to the Kramer matrix.
   *
   * @param cmd      The command to send (ArrayBuffer)
   * @returns        Success state of writing to the socket
   */
  // async send(cmd) {
  //   this.log('debug', 'send(cmd)')
  //   if (this.isConnected()) {
  //     this.log("debug", "sending", cmd, "to", this.config.host);
  //     const response = await this.socket.send(cmd);
  //     if (response.ok) {
  //       return true;
  //     }
  //   } else {
  //     this.log("debug", "Socket not connected");
  //   }
  //
  //   return false;
  // }

  /**
   * Returns if the socket is connected.
   *
   * @returns      If the socket is connected
   */
  isConnected() {
    switch (this.config.connectionProtocol) {
      case this.CONNECT_TCP:
        return this.socket.isConnected();

      case this.CONNECT_UDP:
        return true;
    }

    return false;
  }

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
        width: 4,
        regex: Regex.IP,
      },
      {
        type: "dropdown",
        id: "protocol",
        label: "Protocol",
        default: this.PROTOCOL_3000,
        width: 4,
        choices: [
          { id: this.PROTOCOL_2000, label: "Protocol 2000" },
          { id: this.PROTOCOL_3000, label: "Protocol 3000" },
        ],
      },
      {
        type: "dropdown",
        id: "connectionProtocol",
        label: "TCP or UDP",
        default: this.CONNECT_TCP,
        width: 4,
        choices: [
          { id: this.CONNECT_TCP, label: "TCP (Port 5000)" },
          { id: this.CONNECT_UDP, label: "UDP (Port 50000)" },
        ],
      },
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Counts",
        value:
          "Set the number of inputs, outputs, and presets the matrix supports. " +
          "Leave a field blank to auto-detect their values.",
      },
      {
        type: "textinput",
        id: "inputCount",
        label: "Input count",
        default: "",
        width: 2,
        regex: "/^\\d*$/",
      },
      {
        type: "textinput",
        id: "outputCount",
        label: "Output count",
        default: "",
        width: 2,
        regex: "/^\\d*$/",
      },
      {
        type: "textinput",
        id: "setupsCount",
        label: "Preset count",
        default: "",
        width: 2,
        regex: "/^\\d*$/",
      },
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Customize",
        value:
          "Different matrices may use different commands. Customize them here. Leave default if unsure.",
      },
      {
        type: "dropdown",
        id: "customizeRoute",
        label: "Route command",
        default: this.ROUTE_VID,
        width: 4,
        choices: [
          { id: this.ROUTE_ROUTE, label: "#ROUTE" },
          { id: this.ROUTE_VID, label: "#VID" },
        ],
      },
      {
        type: "dropdown",
        id: "customizeDisconnect",
        label: "Disconnect parameter",
        default: this.DISCONNECT_0,
        width: 4,
        choices: [
          { id: this.DISCONNECT_0, label: "0 (most common)" },
          { id: this.DISCONNECT_INP1, label: "Number of inputs +1" },
        ],
      },
    ];
  }

  /**
   * Cleanup when the module gets deleted.
   */
  async destroy() {
    this.log('debug', 'destroy');

    if (this.socket !== undefined) {
      this.socket.destroy();
      delete this.socket;
    }
  }

  /**
   * Creates the actions for this module.
   */
  actions() {
    let inputOpts = [{ id: "0", label: "Off" }];
    let outputOpts = [{ id: "0", label: "All" }];
    let setups = [];

    // Set some sane minimum/maximum values on the capabilities
    let inputCount = Math.min(64, Math.max(1, this.config.inputCount));
    let outputCount = Math.min(64, Math.max(1, this.config.outputCount));
    let setupsCount = Math.min(64, Math.max(1, this.config.setupsCount));

    // Build the inputs, outputs, and setups
    for (let i = 1; i <= inputCount; i++) {
      inputOpts.push({ id: i, label: `Input ${i}` });
    }
    for (let i = 1; i <= outputCount; i++) {
      outputOpts.push({ id: i, label: `Output ${i}` });
    }
    for (let i = 1; i <= setupsCount; i++) {
      setups.push({ id: i, label: `Preset ${i}` });
    }

    /**
     * Formats the command as per the Kramer 2000 protocol.
     *
     * @param instruction    String or base 10 instruction code for the command
     * @param paramA         String or base 10 parameter A for the instruction
     * @param paramB         String or base 10 parameter B for the instruction
     * @param machine        String or base 10 for the machine to target
     * @returns              The built command to send
     */
    const makeCommand = (instruction, paramA, paramB, machine) => {
      switch (this.config.protocol) {
        case this.PROTOCOL_2000:
          return Buffer.from([
            parseInt(instruction, 10),
            this.MSB + parseInt(paramA || 0, 10),
            this.MSB + parseInt(paramB || 0, 10),
            this.MSB + parseInt(machine || 1, 10),
          ]);

        case this.PROTOCOL_3000:
          switch (instruction) {
            case this.DEFINE_MACHINE:
              switch (paramA) {
                case this.CAPS_VIDEO_INPUTS:
                case this.CAPS_VIDEO_OUTPUTS:
                  // Are combined into one instruction in Protocol 3000
                  return "#INFO-IO?\r";

                case this.CAPS_SETUPS:
                  return "#INFO-PRST?\r";
              }
              break;

            case this.SWITCH_AUDIO:
              // paramA = inputs
              // paramB = outputs

              if (paramA === "0") {
                paramA = getDisconnectParameter();
              }

              if (paramB === "0") {
                // '0' means route to all outputs
                paramB = "*";
              }

              switch (this.config.customizeRoute) {
                case this.ROUTE_ROUTE:
                  return `#ROUTE 1,${paramB},${paramA}\r`;

                default:
                  this.log(
                    "info",
                    "Audio can only be switched using the #ROUTE command.",
                  );
                  return null;
              }
              break;

            case this.SWITCH_VIDEO:
              // paramA = inputs
              // paramB = outputs

              if (paramA === "0") {
                paramA = getDisconnectParameter();
              }

              if (paramB === "0") {
                // '0' means route to all outputs
                paramB = "*";
              }

              switch (this.config.customizeRoute) {
                case this.ROUTE_ROUTE:
                  return `#ROUTE 0,${paramB},${paramA}\r`;

                case this.ROUTE_VID:
                default:
                  return `#VID ${paramA}>${paramB}\r`;
              }
              break;

            case this.STORE_SETUP:
              return `#PRST-STO ${paramA}\r`;

            case this.DELETE_SETUP:
              this.log(
                "info",
                "Deleting presets is not supported on Protocol 3000 matrices.",
              );
              return;

            case this.RECALL_SETUP:
              return `#PRST-RCL ${paramA}\r`;

            case this.FRONT_PANEL:
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
    const getDisconnectParameter = () => {
      switch (this.config.customizeDisconnect) {
        case this.DISCONNECT_INP1:
          return this.config.inputCount + 1;

        case this.DISCONNECT_0:
        default:
          return "0";
      }
    };

    this.setActionDefinitions({
      "switch_audio": {
        name: "Switch Audio",
        options: [
          {
            type: "dropdown",
            name: "Input #",
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
          let cmd = makeCommand(
            this.SWITCH_AUDIO,
            event.options.input,
            event.options.output,
          );
          this.log('debug', `Kramer command: ${cmd}`)
          this.socket.send(cmd);
        },
      },
      "switch_video": {
        name: "Switch Video",
        options: [
          {
            type: "dropdown",
            name: "Input #",
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
          let cmd = makeCommand(
            this.SWITCH_VIDEO,
            event.options.input,
            event.options.output,
          );
          this.send(cmd);
        },
      },
      "switch_video_dynamic": {
        name: "Switch Video (Dynamic)",
        options: [
          {
            type: "textinput",
            useVariables: true,
            name: "Input #",
            id: "input",
            default: "0",
          },
          {
            type: "textinput",
            useVariables: true,
            name: "Output #",
            id: "output",
            default: "0",
          },
        ],
        callback: async (event) => {
          const input = parseInt(this.parseVariablesInString(event.options.input));
          const output = parseInt(this.parseVariablesInString(event.options.output));
          let cmd = makeCommand(
            this.SWITCH_VIDEO,
            input,
            output,
          );
          this.send(cmd);
        },
      },
      "switch_audio_dynamic": {
        name: "Switch Audio (Dynamic)",
        options: [
          {
            type: "textinput",
            useVariables: true,
            name: "Input #",
            id: "input",
            default: "0",
            regex: "/^\\d*$/",
          },
          {
            type: "textinput",
            useVariables: true,
            name: "Output #",
            id: "output",
            default: "0",
            regex: "/^\\d*$/",
          },
        ],
        callback: async (event) => {
          const input = parseInt(this.parseVariablesInString(event.options.input));
          const output = parseInt(this.parseVariablesInString(event.options.output));
          let cmd = makeCommand(
            this.SWITCH_AUDIO,
            input,
            output,
          );
          this.send(cmd);
        },
      },
      "recall_setup": {
        name: "Recall Preset",
        options: [
          {
            type: "dropdown",
            name: "Preset",
            id: "setup",
            default: "1",
            choices: setups,
          },
        ],
        callback: async (event) => {
          let cmd = makeCommand(
            this.RECALL_SETUP,
            event.options.setup,
            0,
          );
          this.send(cmd);
        },
      },
      "store_setup": {
        name: "Store Preset",
        options: [
          {
            type: "dropdown",
            name: "Preset",
            id: "setup",
            default: "1",
            choices: setups,
          },
        ],
        callback: async (event) => {
          let cmd = makeCommand(
            this.STORE_SETUP,
            event.options.setup,
            0, /* STORE */
          );
          this.send(cmd);
        },
      },
      "delete_setup": {
        name: "Delete Preset",
        options: [
          {
            type: "dropdown",
            name: "Preset",
            id: "setup",
            default: "1",
            choices: setups,
          },
        ],

        callback: async (event) => {
          // Not a bug. The command to delete a setup is to store it.
          let cmd = makeCommand(
            this.STORE_SETUP,
            event.options.setup,
            1, /* DELETE */
          );
          this.send(cmd);
        },
      },
      "front_panel": {
        name: "Front Panel Lock",
        options: [
          {
            type: "dropdown",
            name: "Status",
            id: "status",
            default: "0",
            choices: [
              { id: "0", name: "Unlock" },
              { id: "1", name: "Lock" },
            ],
          },
        ],
        callback: async (event) => {
          let cmd = makeCommand(
            this.FRONT_PANEL,
            event.options.status,
            0,
          );
          this.send(cmd);
        },
      },
    });
  }

  /**
   * Executes the action and sends the TCP packet to the Kramer matrix.
   *
   * @param action      The action to perform
   */
  // action(action) {
  //   let cmd = undefined;
  //
  //   // Clone 'action.options', otherwise reassigning the parsed variables directly will push
  //   //  them back into the config, because that's done by reference.
  //   let opt = JSON.parse(JSON.stringify(action.options));
  //
  //   // Loop through each option for this action, and if any appear to be variables, parse them
  //   //  and reassign the result back into 'opt'.
  //   for (const key in opt) {
  //     let v = opt[key];
  //     if (typeof v === "string" && v.includes("$(")) {
  //       this.system.emit("variable_parse", v, (parsed) => v = parsed.trim());
  //       if (v.match(/^\d+$/)) {
  //         opt[key] = v;
  //       } else {
  //         this.log(
  //           "error",
  //           `Cannot parse '${v}' in '${action.action}.${key}' as a number. Skipping action.`,
  //         );
  //         return;
  //       }
  //     }
  //   }
  //
  //   switch (action.action) {
  //     case "switch_audio":
  //       cmd = this.makeCommand(this.SWITCH_AUDIO, opt.input, opt.output);
  //       break;
  //
  //     case "switch_video":
  //       cmd = this.makeCommand(this.SWITCH_VIDEO, opt.input, opt.output);
  //       break;
  //
  //     case "switch_audio_dynamic":
  //       cmd = this.makeCommand(this.SWITCH_AUDIO, opt.input, opt.output);
  //       break;
  //
  //     case "switch_video_dynamic":
  //       cmd = this.makeCommand(this.SWITCH_VIDEO, opt.input, opt.output);
  //       break;
  //
  //     case "store_setup":
  //       cmd = this.makeCommand(this.STORE_SETUP, opt.setup, 0 /* STORE */);
  //       break;
  //
  //     case "delete_setup":
  //       // Not a bug. The command to delete a setup is to store it.
  //       cmd = this.makeCommand(this.STORE_SETUP, opt.setup, 1 /* DELETE */);
  //       break;
  //
  //     case "recall_setup":
  //       cmd = this.makeCommand(this.RECALL_SETUP, opt.setup, 0);
  //       break;
  //
  //     case "front_panel":
  //       cmd = this.makeCommand(this.FRONT_PANEL, opt.status, 0);
  //       break;
  //   }
  //
  //   if (cmd) {
  //     this.send(cmd);
  //   }
  // }
}

runEntrypoint(KramerInstance, []);
