// eslint-disable-next-line strict
'use strict';

const path = require('path');
const EventEmmiter = require('events');
const SLEEPTManager = require(path.resolve(__dirname,'..','sleept','SLEEPTMananger'));
const { autoEndLog, constants, logger: LoggerC, Util, collection } = require(path.resolve(__dirname,'..','utils'));
const channel = require(path.resolve(__dirname,'..','structures','channels'));

var logger;
var sleept;

/**
 * Creates the main class to generate clients.
 * @extends {EventEmmiter}
 */
class Client extends EventEmmiter {
    /**
     * @type {ClientOptions} [autoLogEnd Boolean, Default: true]
     */
    constructor(options = {}) {
        super();
        /**
         * The options the client was instantiated with
         * @type {ClientOptions}
         */
        this.options = Util.mergeDefault(constants.defaultOptions, options);
        this._validateOptions();

        logger = new LoggerC({debug:this.options.debug});

        /**
         * Display a message saying debug is active is debug is active
         */
        logger.debug('Debug is active!');

        Object.defineProperty(this, 'token', { writable: true });

        /**
         * Load client token from process enviroment if its not passed on login
         */
        if (!this.token && 'CLIENT_TOKEN' in process.env) {
            /**
             * Authorization token for the logged in user/bot
             * <warn>This should be kept private at all times.</warn>
             * @type {?String}
             * @private
             */
            this.token = process.env.CLIENT_TOKEN;
        } else {
            this.token = null;
        }

        /**
         * User that the client is logged in as
         * @type {?ClientUser}
         */
        this.user = null;

        /**
         * Time at which the client was last regarded as being in the `READY` state
         * (each time the client disconnects and successfully reconnects, this will be overwritten)
         * @type {?Date}
         */
        this.readyAt = null;

        /**
         * The bool of the system of auto logger finish event
         * @type {Boolean}
         */
        this.autoLogEnd = options.autoLogEnd;

        /**
         * Disable autoLogEnd if debug is actived for complete stacktraces
         * also display a warn saying that
         */
        if (this.options.debug && this.autoLogEnd) {
            logger.warn('AutoLogEnd disabled because debug is enabled');
        }

        /**
         * Activates the autoEndLog depending of user config, Default 'active'
         */
        if (this.autoLogEnd && !this.options.debug) {
            autoEndLog.activate();
        }

        /**
         * A collection with all channels
         * @type {Collection}
         */
        this.channels = new collection();
        /**
         * Create the channel collection for each channel
         */
        options.channels.forEach((channelName) => {
            if (channelName.slice(0, 1) !== '#') {
                channelName = '#' + channelName;
            }
            this.channels.set(channelName, new channel(this, { channel: channelName }));
            this.channels.get = (channelName) => {
                if (channelName.slice(0, 1) !== '#') {
                    channelName = '#' + channelName;
                }
                return this.channels.find((channel) => channel.name === channelName);
            };
        });

        /**
         * Intervals set by {@link Client#setInterval} that are still active
         * @type {Set<Timeout>}
         * @private
         */
        this._intervals = new Set();

        /**
         * If messageSweepInterval is bigger than 0 start a interval of this time to run the sweepMessage function
         */
        if (options.messageSweepInterval > 0) {
            setInterval(this.sweepMessages.bind(this), options.messageSweepInterval * 1000);
        }

        /**
         * The SLEEPT manager of the client
         * @type {SLEEPTManager}
         * @private
         */
        this.sleept = new SLEEPTManager(this);

        sleept = this.sleept;

        this.ws = {
            send: (websocketString) => {
                return sleept.methods.sendRawMessage(websocketString);
            }
        };
    }

    /**
     * Returns the time bot is connected with twitch in miliseconds
     * @returns {Promise<Resolve>}
     * @example
     * await Client.uptime()
     * @example
     * Client.uptime().then((Time) => { })
     */
    uptime() {
        return Promise.resolve(Date.now() - this.readyAt);
    }

    /**
     * Logs the client in, establishing a websocket connection to Twitch.
     * @param {String} [token] Token of the account to log in with (Opcional)
     * @param {Boolean} [false] False to Anonymous mode (Opcional)
     * @returns {Promise<Pending>}
     * @example
     * Client.login('token')
     *  .then()
     * @example
     * Client.login(false)
     *  .then()
     */
    login(token) {
        return this.sleept.methods.login(token);
    }

    /**
     * Join the bot on the channel parsed
     * @param {String} [channelName] The name of the channel the bot will connect
     * @returns {Promise<Pending>} true if the bot connect, false if it cannot connect
     * @example
     * client.join('channelName')
     *  .then()
     */
    join(channelName) {
        return this.sleept.methods.join(channelName);
    }

    /**
     * Leave the bot on the channel parsed
     * @param {String} [channelName] The name of the channel the bot will disconnect
     * @returns {Promise<Pending>} true if the bot disconnect, false if it cannot disconnect
     * @example
     * client.leave('channelName')
     *  .then()
     */
    leave(channelName) {
        return this.sleept.methods.leave(channelName);
    }

    /**
     * Get the API ping
     * @returns {Promise<Number>} return the API ping in milliseconds
     * @example
     * client.ping()
     */
    ping() {
        return this.sleept.methods.ping();
    }

    /**
     * Emit a event from client level
     * @param {String} event the name of the event than will be sended
     * @param {Any} args the args of the event
     * @example
     * client.eventEmmiter('event', Args)
     */
    eventEmmiter(event, ...args) {
        switch (event) {
            case 'message':
                var responseMessage = {
                    /**
                     * @returns {String} text content of message
                     */
                    toString() {
                        return this.content;
                    },
                    /**
                     * @type {String} The string of context text of message
                     */
                    content: args[0].params[1].toString(),
                    /**
                     * responds the author of message
                     * @param {String} [message] the message than will be sended as reply of original message
                     * @return {Promise<Pending>} The message sended metadata
                     */
                    reply: (message) => {
                        // eslint-disable-next-line max-len
                        return this.sleept.methods.replyMessage(args[0].tags.id, args[0].params[0], message);
                    },
                    id: args[0].tags.id,
                    channel: this.channels.get(args[0].params[0]),
                    author: this.channels.get(args[0].params[0]).users.get(args[0].prefix.slice(0, args[0].prefix.indexOf('!'))),
                };
                this.emit(event, responseMessage);
                break;
            case 'ready':
                this.emit(event, args[0], args[1]);
                break;
            default:
                this.emit(event, args);
                break;
        }
    }

    /**
     * Sweeps all text-based channels' messages and removes the ones older than the max message lifetime.
     * If the message has been edited, the time of the edit is used rather than the time of the original message.
     * @param {number} [lifetime=this.options.messageCacheLifetime] Messages that are older than this (in seconds)
     * will be removed from the caches. The default is based on {@link ClientOptions#messageCacheLifetime}
     * @returns {number} Amount of messages that were removed from the caches,
     * or -1 if the message cache lifetime is unlimited
     */
    sweepMessages(lifetime = this.options.messageCacheLifetime) {
        if (typeof lifetime !== 'number' || isNaN(lifetime)) logger.fatal('The lifetime must be a number.');
        if (lifetime <= 0) {
            logger.debug('Didn\'t sweep messages - lifetime is unlimited');
            return -1;
        }

        const lifetimeMs = lifetime * 1000;
        const now = Date.now();
        let channels = 0;
        let messages = 0;

        for (const channel of this.channels.values()) {
            if (!channel.messages) continue;
            channels++;

            messages += channel.messages.sweep((message) => now - message.createdTimestamp > lifetimeMs);
        }

        logger.debug(`Swept ${messages} messages older than ${lifetime} seconds in ${channels} channels`);
        return messages;
    }

    /**
     * Disconnect client from TwitchIRC
     * @returns {Promise<Pending>} returned when client disconnect.
     */
    disconnect() {
        return this.sleept.methods.disconnect();
    }

    /**
     * Validates the client options.
     * @param {ClientOptions} [options=this.options] Options to validate
     * @private
     */
    _validateOptions(options = this.options) {
        if (typeof options.messageCacheMaxSize !== 'number' || isNaN(options.messageCacheMaxSize)) {
            throw new TypeError('The messageMaxSize option must be a number.');
        }
        if (typeof options.messageCacheLifetime !== 'number' || isNaN(options.messageCacheLifetime)) {
            throw new TypeError('The messageCacheLifetime option must be a number.');
        }
        if (typeof options.messageSweepInterval !== 'number' || isNaN(options.messageSweepInterval)) {
            throw new TypeError('The messageSweepInterval option must be a number.');
        }
        if (typeof options.fetchAllChatters !== 'boolean') {
            throw new TypeError('The fetchAllChatters option must be a boolean.');
        }
        if (options.disabledEvents && !(options.disabledEvents instanceof Array)) {
            throw new TypeError('The disabledEvents option must be an Array.');
        }
        if (typeof options.retryLimit !== 'number' || isNaN(options.retryLimit)) {
            throw new TypeError('The retryLimit  options must be a number.');
        }
        if (options.autoLogEnd && typeof options.autoLogEnd !== 'boolean') {
            throw new TypeError('The autoLogEnd options must be a boolean.');
        }
        if (options.channels && !(options.channels instanceof Array)) {
            throw new TypeError('The channels options must be a array.');
        }
        if (options.debug && typeof options.debug !== 'boolean') {
            throw new TypeError('The debug options must be a boolean.');
        }
        if (options.connectedChannels && !(options.channels instanceof Array) && options.connectedChannels.length > 0) {
            throw new TypeError('The connectedChannels options must be a array and must be empty.');
        }
        Object.keys(options).forEach((OptionName) => {
            if (!Object.keys(constants.defaultOptions).includes(OptionName)) {
                autoEndLog.activate();
                throw new TypeError('The option: ' + OptionName + ' is not a valid option.');
            }
        });
    }
}

module.exports = Client;
