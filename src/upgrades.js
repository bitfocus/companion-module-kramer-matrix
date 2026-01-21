
const protocol2000 = require('./protocol2000')
const p2000 = require('./protocol2000')



module.exports = {

	/**
	 * Upgrade config to match current version
	 * @param {any} context
	 * @param {any} props
	 */
	configUpdate: function (context, props) {
		const result = {
			updatedConfig: props.config,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		// set connection protocol
		if (typeof props.config.connectionProtocol == 'undefined') {
			result.updatedConfig.connectionProtocol = p2000.CONNECT_TCP
		}


		// Customize route command
		if (typeof props.config.customizeRoute == 'undefined') {
			result.updatedConfig.customizeRoute = p2000.ROUTE_VID
        }

		// Customize disconnect command
		if (typeof props.config.customizeDisconnect == 'undefined') {
			result.updatedConfig.customizeDisconnect = p2000.DISCONNECT_0
        }


		// set port
		if (!props.config.port) {
			if (props.config.connectionProtocol == p2000.CONNECT_TCP) {
				result.updatedConfig.port = 5000
			} else if (props.config.connectionProtocol == p2000.CONNECT_UDP) {
				result.updatedConfig.port = 50000
            }
		}

		// disable audio
		if (typeof props.config.disableAudio == "undefined") {
			result.updatedConfig.disableAudio = false
		}

		// Advanced network settings
		if (typeof props.config.timingSettings == "undefined") {
			result.updatedConfig.timingSettings = false
		}

		// Timeout response
		if (typeof props.config.responseTimeout == "undefined") {
			result.updatedConfig.responseTimeout = 35
		}

		// Timeout message
		if (typeof props.config.messageTimeout == "undefined") {
			result.updatedConfig.messageTimeout = 0
		}

		// Number of attempts
		if (typeof props.config.maxAttempts == "undefined") {
			result.updatedConfig.maxAttempts = 20
		}

		return result
	},


	// more will be added here later
}