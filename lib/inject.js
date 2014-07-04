'use strict';

var fs = require('fs');
var path = require('path');
var console = require('winston');
var _ = require('lodash');
var ignorePath;


var fileTypes = {
    html: {
        block: /(([ \t]*)<!--\s*src:*(\S*)\s*-->)(\n|\r|.)*?(<!--\s*endsrc\s*-->)/gi,
        detect: {
            js: /<script.*src=['"](.+)['"]>/gi,
            css: /<link.*href=['"](.+)['"]/gi
        },
        replace: {
            js: '<script src="{{filePath}}"></script>',
            css: '<link rel="stylesheet" href="{{filePath}}" />'
        }
    },

    jade: {
        block: /(([ \t]*)\/\/\s*src:*(\S*))(\n|\r|.)*?(\/\/\s*endsrc)/gi,
        detect: {
            js: /script\(.*src=['"](.+)['"]>/gi,
            css: /link\(href=['"](.+)['"]/gi
        },
        replace: {
            js: 'script(src=\'{{filePath}}\')',
            css: 'link(rel=\'stylesheet\', href=\'{{filePath}}\')'
        }
    },

    less: {
        block: /(([ \t]*)\/\/\s*src:*(\S*))(\n|\r|.)*?(\/\/\s*endsrc)/gi,
        detect: {
            css: /@import\s['"](.+)['"]/gi,
            less: /@import\s['"](.+)['"]/gi
        },
        replace: {
            css: '@import "{{filePath}}";',
            less: '@import "{{filePath}}";'
        }
    },

    sass: {
        block: /(([ \t]*)\/\/\s*src:*(\S*))(\n|\r|.)*?(\/\/\s*endsrc)/gi,
        detect: {
            css: /@import\s['"](.+)['"]/gi,
            sass: /@import\s['"](.+)['"]/gi,
            scss: /@import\s['"](.+)['"]/gi
        },
        replace: {
            css: '@import {{filePath}}',
            sass: '@import {{filePath}}',
            scss: '@import {{filePath}}'
        }
    },

    scss: {
        block: /(([ \t]*)\/\/\s*src:*(\S*))(\n|\r|.)*?(\/\/\s*endsrc)/gi,
        detect: {
            css: /@import\s['"](.+)['"]/gi,
            sass: /@import\s['"](.+)['"]/gi,
            scss: /@import\s['"](.+)['"]/gi
        },
        replace: {
            css: '@import "{{filePath}}";',
            sass: '@import "{{filePath}}";',
            scss: '@import "{{filePath}}";'
        }
    },

    yaml: {
        block: /(([ \t]*)#\s*src:*(\S*))(\n|\r|.)*?(#\s*endsrc)/gi,
        detect: {
            js: /-\s(.+)/gi,
            css: /-\s(.+)/gi
        },
        replace: {
            js: '- {{filePath}}',
            css: '- {{filePath}}'
        }
    }
};

/**
 * Find references already on the page, not in a Bower block.
 */
var filesCaught = [];
var srcFiles;

var replaceIncludes = function (file, fileType, returnType) {
    /**
     * Callback function after matching our regex from the source file.
     *
     * @param  {array}  match       strings that were matched
     * @param  {string} startBlock  the opening <!-- src:xxx --> comment
     * @param  {string} spacing     the type and size of indentation
     * @param  {string} blockType   the type of block (js/css)
     * @param  {string} oldScripts  the old block of scripts we'll remove
     * @param  {string} endBlock    the closing <!-- endsrc --> comment
     * @return {string} the new file contents
     */
    return function (match, startBlock, spacing, blockType, oldScripts, endBlock, offset, string) {

        

        blockType = blockType || 'js';

        var newFileContents = startBlock,
            srcExtCheck = new RegExp("^.*\\." + blockType + "$");
        


        (string.substr(0, offset) + string.substr(offset + match.length)).
        replace(oldScripts, '').
        replace(fileType.block, '').
        replace(fileType.detect[blockType], function (match, reference) {
            filesCaught.push(reference.replace(/['"\s]/g, ''));
            return match;
        });

        spacing = returnType + spacing.replace(/\r|\n/g, '');

        _.values(srcFiles).map(function (filePath) {
            return (filePath).replace(/\\/g, '/').replace(ignorePath, '');
        }).filter(function (filePath) {
            if (!srcExtCheck.exec(filePath)) {
                return false;
            }

            if (filesCaught.indexOf(filePath) === -1) {
                return true;
            } else {
                console.log('Add : ' + filePath);
                return false;
            }
        }).forEach(function (filePath) {
            if (typeof fileType.replace[blockType] === 'function') {
                newFileContents += spacing + fileType.replace[blockType](filePath);
            } else if (typeof fileType.replace[blockType] === 'string') {
                newFileContents += spacing + fileType.replace[blockType].replace('{{filePath}}', filePath);
            }
        });

        return newFileContents + spacing + endBlock;
    };
};


/**
 * Take a file path, read its contents, inject the Bower packages, then write
 * the new file to disk.
 *
 * @param  {string} filePath  path to the source file
 */
var injectScripts = function (filePath) {

    // console.warn(filePath);


    var contents = String(fs.readFileSync(filePath));
    var fileExt = path.extname(filePath).substr(1);
    var fileType = fileTypes[fileExt] || fileTypes['default'];
    var returnType = /\r\n/.test(contents) ? '\r\n' : '\n';


    // console.log(fileType);

    var newContents = contents.replace(
        fileType.block,
        replaceIncludes(filePath, fileType, returnType)
    );

    // console.log(newContents);
    //  
    // return;

    if (contents !== newContents) {
        fs.writeFileSync(filePath, newContents);

        if (process.env.NODE_ENV !== 'test') {
            console.log(filePath + ' modified.');
        }
    }
};


var injectScriptsStream = function (filePath, contents, fileExt) {
    var returnType = /\r\n/.test(contents) ? '\r\n' : '\n';
    var fileType = fileTypes[fileExt] || fileTypes['default'];

    return contents.replace(
        fileType.block,
        replaceIncludes(filePath, fileType, returnType)
    );
};


/**
 * Injects dependencies into the specified HTML file.
 *
 * @param  {object} config  the global configuration object.
 * @return {object} config
 */
module.exports = function inject(files, config) {

    
    // console.log(config);

    srcFiles = files;

    config.src = _.compact(config.src);
    config.src.forEach(injectScripts);
    // }

    return config;
};