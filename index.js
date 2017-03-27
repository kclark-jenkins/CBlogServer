#!/usr/bin/env node

var chalk       = require('chalk');
var clear       = require('clear');
var CLI         = require('clui');
var figlet      = require('figlet');
var Spinner     = CLI.Spinner;

let connPool;

var status = new Spinner('Sanity check');
let app = {
    express: require('express'),
    exceptions: {
        throwException: function(exceptionName, exceptionLevel, exceptionMessage, exceptionHtmlMessage) {
            throw {
                name: exceptionName,
                level: exceptionLevel,
                message: exceptionMessage,
                htmlMessage: exceptionHtmlMessage,
                toString: function(){return this.name + ": " + this.message;}
            }
        },
        noServerPortException:       function(config) {
            app.exceptions.throwException(
                'NoServerAddressException: Error code 100',
                'Fatal',
                'No server port was passed to the application configuration.  Either set it in ' + config.confFile + ' or pass it to startApp(OBJECT) as an Object',
                'Error code 100.  Error configuring the application.  Please contact the system administrator and give them this error code'
            )
        },
        noDatabaseUserException:     function(config) {
            app.exceptions.throwException(
                'NoDatabaseUserException: Error code 200',
                'Fatal',
                'No database user was passed to the application configuration.  Either set it in ' + config.confFile + ' or pass it to startApp(OBJECT) as an Object',
                'Error code 200.  Error configuring the application.  Please contact the system administrator and give them this error code'
            )
        },
        noDatabasePasswordException: function(config) {
            app.exceptions.throwException(
                'NoDatabasePasswordException: Error code 201',
                'Fatal',
                'No database password was passed to the application configuration.  Either set it in ' + config.confFile + ' or pass it to startApp(OBJECT) as an Object',
                'Error code 201.  Error configuring the application.  Please contact the system administrator and give them this error code'
            )
        },
        noDatabaseNameException:     function(config) {
            app.exceptions.throwException(
                'NoDatabaseNameException: Error code 202',
                'Fatal',
                'No database name was passed to the application configuration.  Either set it in ' + config.confFile + ' or pass it to startApp(OBJECT) as an Object',
                'Error code 202.  Error configuring the application.  Please contact the system administrator and give them this error code'
            )
        },
        noDatabaseHostnameException: function(config) {
            app.exceptions.throwException(
                'NoDatabaseHostnameException: Error code 203',
                'Fatal',
                'No database hostname was passed to the application configuration.  Either set it in ' + config.confFile + ' or pass it to startApp(OBJECT) as an Object',
                'Error code 203.  Error configuring the application.  Please contact the system administrator and give them this error code',
                config
            )
        }
    },
    mysql: require('mysql'),
    config: {
        confFile:      'blog.config.json',
        confEncoding:  'utf8',
        defaults: {
            server: {
                port: 8081
            }
        },
        app: {
            appAddress:    null,
            appPort:       null,
            config:        null
        },
        getAppPort:    function(config) {
            if (config.server.port === undefined) {
                config.server.address = this.config.defaults.server.port;
            }
            return appConfig;
        },
        readConfigFile: function(configFile, configEncoding) {
            return new Promise(function(fulfill, reject) {
                try {
                    let fs = require('fs');
                    fulfill(JSON.parse(fs.readFileSync(configFile, configEncoding)));
                }catch(err){
                    reject(err);
                }
            });
        },
        configApp:    function(config) {
            process.stdout.write('Starting application configuration');

            process.stdout.write('\n\nChecking for user defined configuration........');
            if(config === undefined) {
                process.stdout.write(chalk.yellow('[WARN]'));
                process.stdout.write('\nTrying ' + app.config.confFile + '........................');
                config = app.config.readConfigFile(app.config.confFile, app.config.confEncoding);
            }else{
                process.stdout.write('\nUsing the following user defined configuration object....');
                console.log(config);
            }

            process.stdout.write(chalk.green('[DONE]'));

            return config.then(function(loadedConfig) {
                return app.config.check.values(loadedConfig);
            });
        },
        check: {
            values: function(config) {
                status.start();
                process.stdout.write('\nChecking for server port.......................');
                if(config.server.port === undefined) {
                    process.stdout.write(chalkred('\nNo port defined, trying to use 8888'));
                    config.server.port = 8888;
                }
                process.stdout.write(chalk.green('[DONE]'));

                process.stdout.write('\nChecking for database user.....................');
                if(config.db.user === undefined) {
                    app.exceptions.noDatabaseUserException(config);
                }
                process.stdout.write(chalk.green('[DONE]'));

                process.stdout.write('\nChecking for database password.................');
                if(config.db.pass === undefined) {
                    app.exceptions.noDatabasePasswordException(config);
                }
                process.stdout.write(chalk.green('[Done]'));

                process.stdout.write('\nChecking for database name.....................');
                if(config.db.database === undefined) {
                    app.exceptions.noDatabaseNameException(config);
                }
                process.stdout.write(chalk.green('[DONE]'));

                process.stdout.write('\nChecking for database hostname.................');
                if(config.db.hostname === undefined) {
                    app.exceptions.noDatabaseHostnameException(config);
                }
                process.stdout.write(chalk.green('[DONE]'));
                status.stop();

                return app.config.check.connection(config);
            },
            connection: function(config) {
                return new Promise(function(fulfill, reject) {
                    let connection = app.mysql.createConnection({
                        host     : config.db.hostname,
                        user     : config.db.user,
                        password : config.db.pass,
                        database : config.db.database
                    });

                    process.stdout.write('\nConnection test to ' + config.db.hostname + '/' + config.db.database + '...');
                    connection.connect(function(sqlerr){
                        if(!sqlerr) {
                            process.stdout.write(chalk.green('[DONE]'));
                            connection.end();
                            fulfill(config);
                        } else {
                            reject(sqlerr);
                        }
                    });
                });
            }
        }
    },
    startConnectionPool: function(config) {
        return app.mysql.createPool({
            connectionLimit : 100, //important
            host     : config.db.hostname,
            user     : config.db.user,
            password : config.db.pass,
            database : config.db.database,
            debug    :  false
        });
    },
    configApp: function(config) {
        return app.config.configApp(config).then(function(goodConfig) {
            return goodConfig;
        }).catch(function(err) {
            console.log(chalk.red(err));
        });
    },
    startApp: function(config) {
        app.configApp(config).then(function(goodConfig) {
            let connectionPool = app.startConnectionPool(goodConfig);
            connectionPool.getConnection(function(err, conn) {if(err) {console.log(err);}return;});
            let api = app.express();

	    api.use(function(req, res, next) {
	      res.header("Access-Control-Allow-Origin", "*");
	      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	      next();
	    });

            api.get('/api/v1/blog/post/:postId', function(request, response) {
                connectionPool.query("select title, content, date_created, image, author from post where id = " + request.params.postId,function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            api.get('/api/v1/blog/post/tag/:tagId', function(request, response) {
                connectionPool.query("select post_id from post_tag where tag_id = " + request.params.tagId,function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            api.get('/api/v1/blog/post/category/:categoryId', function(request, response) {
                connectionPool.query("select post_id from post_category where category_id = " + request.params.categoryId,function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            api.get('/api/v1/blog/tags', function(request, response) {
                connectionPool.query("select count(name) as tagCount, name as tag from tag group by tag;",function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            api.get('/api/v1/blog/categories', function(request, response) {
                connectionPool.query("select count(category) as categoryCount, category from category group by category;",function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            api.get('/api/v1/blog/preview/:postId', function(request, response) {
                connectionPool.query("select * from post_preview where post_id = " + request.params.postId,function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            api.get('/api/v1/blog/all/previews', function(request, response) {
                connectionPool.query("select post.id, title, date_created, image, author, preview from post left join post_preview on post.id = post_preview.post_id",function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            api.get('/api/v1/blog/post/tags/:postId', function(request, response) {
                connectionPool.query("select count(tag_id) as tag_count, name from post_tag left join tag on post_tag.tag_id = tag.id where post_id = " +request.params.postId+ " group by tag_id, post_id",function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            api.get('/api/v1/blog/post/categories/:postId', function(request, response) {
                connectionPool.query("select category from post_category left join category on category.id = post_category.category_id where post_category.post_id = 1 = " +request.params.postId,function(err,rows){
                    if(!err) {
                        response.json(rows);
                    }
                });
            });

            let server = api.listen(goodConfig.server.port, function () {
                let host = server.address().address;
                let port = server.address().port;
                let configOutput = goodConfig;
                configOutput.db.pass = "<<HIDDEN>>";

                process.stdout.write('\nStarting connection pool.......................');
                process.stdout.write(chalk.green('[DONE]\n\n'));
                status.start();
                status.message('CBlogServer listening at http://' + host + ':' + port);
                status.start();
            });
        }).catch(function(err){
            process.stdout.write(chalk.red(err));
        });
    }
};

clear();
console.log(
    chalk.yellow(
        figlet.textSync('CBlogServer', { horizontalLayout: 'full' })
    )
);

app.startApp();