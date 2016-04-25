const TextConverter = (function () {

    "use strict";

    /**
     *
     * @type {{rules: {url: {patterns: *[], rejectedNodeNames: string[]}}, default: (config.rules.url|{patterns, rejectedNodeNames}), ruleMap: {1: (config.rules.url|{patterns, rejectedNodeNames})}}}
     */
    let config = {
        rules: {
            url: {
                patterns: [
                    {
                        searchValue: /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[A-Z0-9+&@#\/%=~_|])/gim,
                        replaceValue: `<a href="$1" target="_blank">$1</a>`
                    },
                    {
                        searchValue: /(^|[^\/])(www\.[\S]+(\b|$))/gim,
                        replaceValue: `$1<a href="http://$2" target="_blank">$2</a>`
                    }
                ],

                rejectedNodeNames: [`A`, `SCRIPT`, `STYLE`]
            }
        }
    };

    /**
     * doc
     * @type {HTMLDocument}
     */
    const doc = document,

        /**
         * parser
         * @type {DOMParser}
         */
        parser = new DOMParser(),

        /**
         * privatePatterns
         * @type {WeakMap}
         */
        privatePatterns = new WeakMap(),

        /**
         * privateRejectedNodeNames
         * @type {WeakMap}
         */
        privateRejectedNodeNames = new WeakMap(),

        /**
         * privateTextNodeFilter
         * @type {WeakMap}
         */
        privateTextNodeFilter = new WeakMap(),

        /**
         * textNodeFilter
         * @param rejectedNodeNames
         * @returns {Function}
         */
        textNodeFilter = rejectedNodeNames => node => {

            /**
             * isReject
             * @type {boolean}
             */
            const isReject = rejectedNodeNames.indexOf(node.nodeName) > -1,

                /**
                 * isTextNode
                 * @type {boolean}
                 */
                isTextNode = node.nodeType === Node.TEXT_NODE;

            let result;

            if (isReject) {
                result = NodeFilter.FILTER_REJECT;
            } else if (isTextNode) {
                result = NodeFilter.FILTER_ACCEPT;
            } else {
                result = NodeFilter.FILTER_SKIP;
            }

            return result;
        },

        /**
         * createTextNodeIterator
         * @param {Node} root
         * @param {Function} filter
         * @returns {NodeIterator}
         */
        createTextNodeIterator = (root, filter) => doc.createNodeIterator(root, NodeFilter.SHOW_TEXT, filter, false),

        /**
         * createHTMLDocument
         * @param {string} str
         * @returns {Document}
         */
        createHTMLDocument = str => parser.parseFromString(str, `text/html`),

        /**
         * replaceChild
         * @param {NodeList} newChildNodes
         * @param {Node} refChildNode
         * @returns {Node}
         */
        replaceChild = (newChildNodes, refChildNode) => {

            /**
             * parentNode
             * @type {Node}
             */
            const parentNode = refChildNode.parentNode;

            let newChildNode;

            for (newChildNode of Array.from(newChildNodes)) {
                parentNode.insertBefore(newChildNode, refChildNode);
            }

            return parentNode.removeChild(newChildNode);
        },

        /**
         * getMissingParameterMessage
         * @param funcName
         * @returns {String}
         */
        getMissingParameterMessage = funcName => `: Failed to execute '${funcName}' on 'Document': 1 argument required, but only 0 present.`,

        /**
         * getBedTypeParameterMessage
         * @param funcName
         * @param constructor
         * @returns {String}
         */
        getBedTypeParameterMessage = (funcName, constructor) => `: Failed to execute '${funcName}' on 'Document': parameter 1 is not of type '${constructor.name}'.`,

        /**
         * checkTypeError
         * @param param
         * @param funcName
         * @param constructor
         */
        checkTypeError = ({param, funcName, constructor}) => {

            let message;

            if (param === undefined) {
                message = getMissingParameterMessage(funcName);
            } else if (!(param instanceof constructor)) {
                message = getBedTypeParameterMessage(funcName, constructor);
            }

            if (message) {
                throw new TypeError(message);
            }
        },

        /**
         * convertString
         * @param {string} str
         * @param {string[]} patterns
         * @returns {string}
         */
        convertString = (str = ``, patterns = []) => {

            let pattern,
                searchValue,

                /**
                 * result
                 * @type {string}
                 */
                result = str;

            for (pattern of patterns) {

                /**
                 * searchValue
                 * @type {RegExp}
                 */
                searchValue = pattern.searchValue;

                if (searchValue.test(result)) {

                    /**
                     * result
                     * @type {string}
                     */
                    result = result.replace(searchValue, pattern.replaceValue);
                }
            }

            return result;
        },

        /**
         * convertTextNode
         * @param {Node} textNode
         * @param {string[]} patterns
         * @returns {Node}
         */
        convertTextNode = (textNode, patterns = []) => {

            /**
             * text
             * @type {string}
             */
            const text = textNode.nodeValue,

                /**
                 * result
                 * @type {string}
                 */
                result = convertString(text, patterns);

            if (text !== result) {

                /**
                 * newChildNodes
                 * @type {NodeList}
                 */
                let newChildNodes = createHTMLDocument(result).body.childNodes;

                replaceChild(newChildNodes, textNode);
            }

            return textNode;
        },

        /**
         * convertElement
         * @param {Node} root
         * @param {string[]} patterns
         * @param {Function} filter
         * @returns {Node}
         */
        convertElement = function (root, patterns = [], filter) {

            /**
             * textNodeIterator
             * @type {NodeIterator}
             */
            const textNodeIterator = createTextNodeIterator(root, filter);

            /**
             * textNode
             * @type {Node}
             */
            let textNode = textNodeIterator.nextNode();

            while (textNode) {
                convertTextNode(textNode, patterns);
                textNode = textNodeIterator.nextNode();
            }

            return root;
        },

        /**
         * getRule
         * @param params
         * @returns {{patterns: string[], rejectedNodeNames: Array}}
         */
        getRule = (...params) => {

            const firstParam = params[0];

            /**
             * rejectedNodeNames
             * @type {string[]}
             */
            let patterns = [],

                /**
                 * rejectedNodeNames
                 * @type {Array}
                 */
                rejectedNodeNames = [];

            if (firstParam instanceof Array) {
                [patterns, rejectedNodeNames] = params;
            } else if (String.name.toLowerCase() === typeof(firstParam) || firstParam instanceof RegExp) {

                /**
                 * searchValue
                 * @type {RegExp|string}
                 */
                let searchValue = "",

                    /**
                     * replaceValue
                     * @type {string|Function}
                     */
                    replaceValue = "";

                [searchValue, replaceValue, rejectedNodeNames] = params;

                /**
                 * patterns
                 * @type {*[]}
                 */
                patterns = [{searchValue: searchValue, replaceValue: replaceValue}];
            }

            return {patterns: patterns, rejectedNodeNames: rejectedNodeNames};
        };

    return class TextConverter {

        /**
         * constructor
         * @param patterns
         * @param rejectedNodeNames
         */
        constructor(patterns = config.rules.url.patterns, rejectedNodeNames = config.rules.url.rejectedNodeNames) {

            const filter = textNodeFilter(rejectedNodeNames);

            privatePatterns.set(this, patterns);
            privateRejectedNodeNames.set(this, rejectedNodeNames);
            privateTextNodeFilter.set(this, filter);
        }

        /**
         * PATTERNS
         * @returns {Array}
         * @constructor
         */
        get PATTERNS() {
            return privatePatterns.get(this);
        }

        /**
         * REJECTED_NODE_NAMES
         * @returns {Array}
         * @constructor
         */
        get REJECTED_NODE_NAMES() {
            return privateRejectedNodeNames.get(this);
        }

        /**
         * convertHTML
         * @param {string} html
         * @returns {string}
         */
        convertHTML(html = ``) {

            /**
             * root
             * @type {Node}
             */
            const root = createHTMLDocument(html).body;

            return this.convertElement(root).innerHTML;
        }

        /**
         * convertHTML
         * @param {string} html
         * @param {Array} params
         * @returns {string}
         */
        static convertHTML(html = ``, ...params) {

            /**
             * root
             * @type {Node}
             */
            const root = createHTMLDocument(html).body;

            return TextConverter.convertElement(root, ...params).innerHTML;
        }

        /**
         * createHTMLDocument
         * @param {string} html
         * @returns {Node}
         */
        createHTMLDocument(html = ``) {

            /**
             * root
             * @type {Document}
             */
            const root = createHTMLDocument(html);

            return this.convertElement(root);
        }

        /**
         * createHTMLDocument
         * @param {string} str
         * @param {Array} params
         * @returns {Node}
         */
        static createHTMLDocument(str = ``, ...params) {

            /**
             * root
             * @type {Document}
             */
            const root = createHTMLDocument(str);

            return TextConverter.convertElement(root, ... params);
        }

        /**
         * convertElement
         * @param {Node} root
         * @returns {Node}
         */
        convertElement(root) {

            /**
             * filter
             * @type {Function}
             */
            const filter = privateTextNodeFilter.get(this);

            return convertElement(root, this.PATTERNS, filter);
        }

        /**
         * convertElement
         * @param {Node} root
         * @param {Array} params
         * @returns {Node}
         */
        static convertElement(root, ...params) {

            /**
             * rule
             * @type {{patterns, rejectedNodeNames}}
             */
            const rule = getRule(...params),

                /**
                 * filter
                 * @type {Function}
                 */
                filter = textNodeFilter(rule.rejectedNodeNames);

            return convertElement(root, rule.patterns, filter);
        }

        /**
         * createTextNodeIterator
         * @param {Node} root
         * @returns {NodeIterator}
         */
        createTextNodeIterator(root) {

            /**
             * filter
             * @type {Function}
             */
            const filter = privateTextNodeFilter.get(this);

            return createTextNodeIterator(root, filter);
        }

        /**
         * createTextNodeIterator
         * @param {Node} root
         * @param {Array} rejectedNodeNames
         * @returns {NodeIterator}
         */
        static createTextNodeIterator(root, rejectedNodeNames = []) {

            /**
             * filter
             * @type {Function}
             */
            const filter = textNodeFilter(rejectedNodeNames);

            return createTextNodeIterator(root, filter);
        }

        /**
         * convertTextNode
         * @param {Node} textNode
         * @returns {Node}
         */
        convertTextNode(textNode) {
            return TextConverter.convertTextNode(textNode, this.PATTERNS);
        }

        /**
         * convertTextNode
         * @param {Node} textNode
         * @param patterns
         * @returns {Node}
         */
        static convertTextNode(textNode, patterns = []) {

            checkTypeError({param: textNode, funcName: `convertTextNode`, constructor: Text});

            return convertTextNode(textNode, patterns);
        }

        /**
         * convertString
         * @param {string} str
         * @returns {string}
         */
        convertString(str = ``) {
            return convertString(str, this.PATTERNS);
        }

        /**
         * convertString
         * @param {string} str
         * @param {*[]} patterns
         * @returns {string}
         */
        static convertString(str = ``, patterns = []) {
            return convertString(str, patterns);
        }
    };
})();