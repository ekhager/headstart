'use strict';

var
	path 				= require('path'),
	globule				= require('globule'),
	fs 					= require('fs'),
	ncp 				= require('ncp').ncp,
	chalk 				= require('chalk'),
	_ 					= require('lodash'),
	prompt 				= require('inquirer').prompt,
	sequence 			= require('run-sequence'),
	stylish 			= require('jshint-stylish'),
	open 				= require('open'),
	copy_paste			= require('copy-paste').silent(),
	ghdownload			= require('github-download'),
	browserSync			= require('browser-sync'),

	gulp 				= require('gulp'),
	rimraf 				= require('gulp-rimraf'),
	watch 				= require('gulp-watch'),
	plumber 			= require('gulp-plumber'),
	gulpif 				= require('gulp-if'),
	rename 				= require('gulp-rename'),
	//	sass 			= require('gulp-sass'),
	sass 				= require('gulp-ruby-sass'),
	sassgraph 			= require('gulp-sass-graph'),
	cmq 				= require('gulp-combine-media-queries'),
	uncss 				= require('gulp-uncss'),
	autoprefixer 		= require('gulp-autoprefixer'),
	jshint 				= require('gulp-jshint'),
	deporder 			= require('gulp-deporder'),
	concat 				= require('gulp-concat'),
	stripDebug 			= require('gulp-strip-debug'),
	uglify 				= require('gulp-uglify'),
	newer 				= require('gulp-newer'),
	imagemin 			= require('gulp-imagemin'),
	tap					= require('gulp-tap'),
	inject 				= require('gulp-inject'),
	handlebars			= require('gulp-compile-handlebars'),
	htmlminify			= require('gulp-minify-html'),
	bytediff			= require('gulp-bytediff'),

	flags 				= require('minimist')(process.argv.slice(2)),
	gitConfig			= {user: 'flovan', repo: 'headstart-boilerplate', ref: '1.0.2'},
	cwd 				= process.cwd(),
	tmpFolder			= '.tmp',
	lrStarted 			= false,
	connection			= {
							local: 'localhost',
							external: null,
							port: null
						},
	isProduction 		= flags.production || flags.prod || false,
	config
;

// INIT -----------------------------------------------------------------------
//

gulp.task('init', function (cb) {

	// Get all files in working directory
	// Exclude . files (such as .DS_Store on OS X)
	var cwdFiles = _.remove(fs.readdirSync(cwd), function (file) {

		return file.substring(0,1) !== '.';
	});

	// If there are any files
	if (cwdFiles.length > 0) {

		// Make sure the user knows what is about to happen
		console.log(chalk.yellow('The current directory is not empty!'));
		prompt({
			type: 'confirm',
			message: 'Initializing will empty the current directory. Continue?',
			name: 'override',
			default: false
		}, function (answer) {

			if (answer.override) {
				// Make really really sure that the user wants this
				prompt({
					type: 'confirm',
					message: 'Removed files are gone forever. Continue?',
					name: 'overridconfirm',
					default: false
				}, function (answer) {

					if (answer.overridconfirm) {
						// Clean up directory, then start downloading
						console.log(chalk.grey('Emptying current directory'));
						sequence('clean-tmp', 'clean-cwd', downloadBoilerplateFiles);
					}
					// User is unsure, quit process
					else process.exit(0);
				});
			}
			// User is unsure, quit process
			else process.exit(0);
		});
	}
	// No files, start downloading
	else downloadBoilerplateFiles();

	cb(null);
});

function downloadBoilerplateFiles () {

	console.log(chalk.grey('Downloading boilerplate files...'));

	// If a custom repo was passed in, use it
	if (!!flags.base) {

		// Check if there's a slash
		if (flags.base.indexOf('/') < 0) {
			console.log(chalk.red('Please pass in a correct repository, eg. `myname/myrepo` or `myname/myrepo#mybranch. Aborting.\n'));
			process.exit(0);
		}

		// Check if there's a reference
		if (flags.base.indexOf('#') > -1) {
			flags.base = flags.base.split('#');
			gitConfig.ref = flags.base[1];
			flags.base = flags.base[0];
		} else {
			gitConfig.ref = null;
		}

		// Extract username and repo
		flags.base = flags.base.split('/');
		gitConfig.user = flags.base[0];
		gitConfig.repo = flags.base[1];

		// Extra validation
		if (gitConfig.user.length <= 0) {
			console.log(chalk.red('The passed in username is invald. Aborting.\n'));
			process.exit(0);
		}
		if (gitConfig.repo.length <= 0) {
			console.log(chalk.red('The passed in repo is invald. Aborting.\n'));
			process.exit(0);
		}
	}

	// Download the boilerplate files to a temp folder
	// This is to prevent a ENOEMPTY error
	ghdownload(gitConfig, tmpFolder)
		// Let the user know when something went wrong
		.on('error', function (error) {
			console.log(chalk.red('An error occurred. Aborting.'), error);
			process.exit(0);
		})
		// Download succeeded
		.on('end', function () {
			console.log(chalk.green('✔ Download complete!'));
			console.log(chalk.grey('Cleaning up...'));

			// Move to working directory, clean temp, finish init
			ncp(tmpFolder, cwd, function (err) {

				if (err) {
					console.log(chalk.red('Something went wrong. Please try again'), err);
					process.exit(0);
				}

				sequence('clean-tmp', function () {
					finishInit();
				});
			});
		})
		// TODO: Try to catch the error when a ZIP has "NOEND"
	;
}

function finishInit () {

	// Ask the user if he wants to continue and
	// have the files served and opened
	prompt({
			type: 'confirm',
			message: 'Would you like to have these files served?',
			name: 'build',
			default: true
	}, function (buildAnswer) {

		if (buildAnswer.build) {
			flags.serve = true;
			prompt({
					type: 'confirm',
					message: 'Should they be opened in the browser?',
					name: 'open',
					default: true

			}, function (openAnswer) {

				if (openAnswer.open) flags.open = true;
				prompt({
					type: 'confirm',
					message: 'Should they be opened in an editor?',
					name: 'edit',
					default: true

				}, function (editAnswer) {

					if (editAnswer.edit) flags.edit = true;
					gulp.start('build');
				});
			});
		}
		else process.exit(0);
	});
}

// BUILD ----------------------------------------------------------------------
//

gulp.task('build', function (cb) {

	// Load the config.json file
	console.log(chalk.grey('Loading config.json...'));
	fs.readFile('config.json', 'utf8', function (err, data) {

		if (err) {
			console.log(chalk.red('Cannot find config.json. Have you initiated Headstart through `headstart init?'), err);
			process.exit(0);
		}

		// Try parsing the config data as JSON
		try {
			config = JSON.parse(data);
		} catch (err) {
			console.log(chalk.red('The config.json file is not valid json. Aborting.'), err);
			process.exit(0);
		}

		// Run build tasks
		// Serve files if Headstart was run with the --serve flag
		console.log(chalk.grey('Building ' + (flags.production ? 'production' : 'dev') + ' version...'));
		if (flags.serve) {
			sequence(
				'clean-export',
				[
					'sass-main',
					'sass-ie',
					'scripts-view',
					'scripts-main',
					'scripts-ie',
					'images',
					'misc',
					'other'
				],
				'templates',
				'uncss-main',
				'uncss-view',
				'server',
				cb
			);
		} else {
			sequence(
				'clean-export',
				[
					'sass-main',
					'sass-ie',
					'scripts-view',
					'scripts-main',
					'scripts-ie',
					'images',
					'misc',
					'other'
				],
				'templates',
				'uncss-main',
				'uncss-view',
				function () {
					if(flags.edit) openEditor();
					console.log(chalk.green('✔ All done!'));
				}
			);
		}
	});

	cb(null);
});

// CLEAN ----------------------------------------------------------------------
//

gulp.task('clean-export', function (cb) {

	// Remove export folder and files
	return gulp.src([
			config.export_templates,
			config.export_assets + '/assets'
		], {read: false})
		.pipe(rimraf({force: true}))
	;
});

gulp.task('clean-cwd', function (cb) {

	// Remove cwd files
	return gulp.src(cwd + '/**/*', {read: false})
		.pipe(rimraf({force: true}))
	;
});

gulp.task('clean-tmp', function (cb) {

	// Remove temp folder
	return gulp.src(tmpFolder, {read: false})
		.pipe(rimraf({force: true}))
	;
});

// SASS -----------------------------------------------------------------------
//

// Note: Once libsass fixed the @extend bug (and is stable enough), Headstart 
// will switch to that implementation rather than the Ruby one (which is slower).
// https://github.com/hcatlin/libsass/issues/146

gulp.task('sass-main', function (cb) {

	// Process the .scss files
	// While serving, this task opens a continuous watch
	return ( !lrStarted ?
			gulp.src([
				'assets/sass/*.{sass, scss, css}',
				'!assets/sass/*ie.{sass, scss, css}'
			])
			:
			watch({ glob: 'assets/sass/**/*.{sass, scss, css}', emitOnGlob: false, name: 'SASS-MAIN', silent: true })
				.pipe(plumber())
				.pipe(sassgraph(['assets/sass']))
		)
		//.pipe(sass({ outputStyle: (isProduction ? 'compressed' : 'nested'), errLogToConsole: true }))
		.pipe(sass({ style: (isProduction ? 'compressed' : 'nested') }))
		.pipe(gulpif(config.combineMediaQueries, cmq()))
		.pipe(autoprefixer('last 2 version', 'safari 5', 'ie 8', 'ie 9', 'opera 12.1', 'ios 6', 'android 4'))
		.pipe(gulpif(isProduction, rename({suffix: '.min'})))
		.pipe(gulp.dest(config.export_assets + '/assets/css'))
		.pipe(gulpif(lrStarted, browserSync.reload({stream:true})))
	;

	// Continuous watch never ends, so end it manually
	if(lrStarted) cb(null);
});

gulp.task('sass-ie', function (cb) {

	// Process the .scss files
	// While serving, this task opens a continuous watch
	return ( !lrStarted ?
			gulp.src([
				'assets/sass/ie.{sass, scss, css}'
			])
			:
			watch({ glob: 'assets/sass/**/ie.{sass, scss, css}', emitOnGlob: false, name: 'SASS-IE', silent: true })
				.pipe(plumber())
				.pipe(sassgraph(['assets/sass']))
		)
		//.pipe(sass({ outputStyle: (isProduction ? 'compressed' : 'nested'), errLogToConsole: true }))
		.pipe(sass({ style: (isProduction ? 'compressed' : 'nested') }))
		.pipe(gulp.dest(config.export_assets + '/assets/css/ie.min.css'))
	;

	// Continuous watch never ends, so end it manually
	if(lrStarted) cb(null);
});

// SCRIPTS --------------------------------------------------------------------
//

// JSHint options:	http://www.jshint.com/docs/options/
gulp.task('hint-scripts', function (cb) {

	if (!config.hint) cb(null);
	else {
		// Hint all non-lib js files and exclude _ prefixed files
		return gulp.src([
				'assets/js/*.js',
				'assets/js/core/*.js',
				'!_*.js'
			])
			.pipe(plumber())
			.pipe(jshint('.jshintrc'))
			.pipe(jshint.reporter(stylish))
		;
	}
});

gulp.task('scripts-main', ['hint-scripts'], function () {

	//var debug = require('gulp-debug');

	// Process .js files
	// Files are ordered for dependency sake
	return gulp.src([
				'assets/js/libs/jquery*.js',
				'assets/js/libs/ender*.js',

				(isProduction ? '!' : '') + 'assets/js/libs/dev/*.js',

				'assets/js/libs/**/*.js',
				// TODO: remove later
				'assets/js/core/**/*.js',
				//
				'assets/js/*.js',
				'!assets/js/view-*.js',
				'!**/_*.js'
			], {base: '' + 'assets/js'}
		)
		.pipe(plumber())
		.pipe(gulpif(isProduction, stripDebug()))
		.pipe(gulpif(isProduction, concat('core-libs.min.js')))
		.pipe(gulpif(isProduction, uglify()))
		.pipe(gulp.dest(config.export_assets + '/assets/js'))
	;
});

gulp.task('scripts-view', ['hint-scripts'], function (cb) {

	return gulp.src('assets/js/view-*.js')
		.pipe(plumber())
		.pipe(gulpif(isProduction, rename({suffix: '.min'})))
		.pipe(gulpif(isProduction, stripDebug()))
		.pipe(gulpif(isProduction, uglify()))
		.pipe(gulp.dest(config.export_assets + '/assets/js'))
	;
});

gulp.task('scripts-ie', function (cb) {

	// Process .js files
	// Files are ordered for dependency sake
	gulp.src([
		'assets/js/ie/head/**/*.js',
		'!**/_*.js'
	])
		.pipe(plumber())
		.pipe(deporder())
		.pipe(concat('ie.head.min.js'))
		.pipe(gulpif(isProduction, stripDebug()))
		.pipe(uglify())
		.pipe(gulp.dest(config.export_assets + '/assets/js'));

	gulp.src([
		'assets/js/ie/body/**/*.js',
		'!**/_*.js'
	])
		.pipe(plumber())
		.pipe(deporder())
		.pipe(concat('ie.body.min.js'))
		.pipe(gulpif(isProduction, stripDebug()))
		.pipe(uglify())
		.pipe(gulp.dest(config.export_assets + '/assets/js'));

	cb();
});

// IMAGES ---------------------------------------------------------------------
//

gulp.task('images', function (cb) {

	// Make a copy of the favicon.png, and make a .ico version for IE
	// Move to root of export folder
	gulp.src('assets/images/icons/favicon.png')
		.pipe(plumber())
		.pipe(rename({extname: '.ico'}))
		.pipe(gulp.dest(config.export_misc))
	;

	// Grab all image files, filter out the new ones and copy over
	// In --production mode, optimize them first
	return gulp.src([
			'assets/images/**/*',
			'!_*'
		])
		.pipe(plumber())
		.pipe(newer(config.export_assets+ '/assets/images'))
		.pipe(gulpif(isProduction, imagemin({ optimizationLevel: 3, progressive: true, interlaced: true, silent: true })))
		.pipe(gulp.dest(config.export_assets + '/assets/images'))
		.pipe(gulpif(lrStarted, browserSync.reload({stream:true})))
	;
});

// OTHER ----------------------------------------------------------------------
//

gulp.task('other', function (cb) {

	// Make sure other files and folders are copied over
	// eg. fonts, videos, ...
	return gulp.src([
			'assets/**/*',
			'!assets/sass',
			'!assets/sass/**/*',
			'!assets/js/**/*',
			'!assets/images/**/*',
			'!_*'
		])
		.pipe(plumber())
		.pipe(gulp.dest(config.export_assets + '/assets'))
	;
});

// MISC -----------------------------------------------------------------------
//
 
gulp.task('misc', function (cb) {

	// In --production mode, copy over all the other stuff
	if (isProduction) {
		// Make a functional version of the htaccess.txt
		gulp.src('misc/htaccess.txt')
			.pipe(rename('.htaccess'))
			.pipe(gulp.dest(config.export_misc))
		;

		gulp.src(['misc/*', '!misc/htaccess.txt', '!_*'])
			.pipe(gulp.dest(config.export_misc))
		;
	}

	cb(null);
});

// HTML -----------------------------------------------------------------------
//
 
gulp.task('templates', function (cb) {

	// If assebly is off, export all folders and files
	if (!config.assemble_templates) {
		gulp.src(['templates/**/*', '!templates/*.*', '!_*'])
			.pipe(gulp.dest(config.export_templates));
	}

	// Find number of templates to parse and keep counter
	var numTemplates = globule.find(['templates/*.*', '!_*']).length,
		count = 0;

	// Go over all root template files
	gulp.src(['templates/*.*', '!_*'])
		.pipe(tap(function (htmlFile)
		{
			var
				// Select JS files
				// Production will get 1 file only
				// Development gets raw base files 
				injectItems = isProduction ?
					[config.export_assets + '/assets/js/core-libs.min.js']
					:
					[
						'assets/js/libs/jquery*.js',
						'assets/js/libs/ender.js',

						(isProduction ? '!' : '') + 'assets/js/libs/dev/*.js',

						'assets/js/libs/*.js',
						'assets/js/core/*.js',
						'assets/js/*.js',

						'!' + 'assets/js/view-*.js',
						'!**/_*.js'
					],
				// Extract bits from filename
				baseName = path.basename(htmlFile.path),
				nameParts = baseName.split('.'),
				ext = _.without(nameParts, _.first(nameParts)).join('.'),
				viewBaseName = _.last(nameParts[0].split('view-')),
				viewName = 'view-' + viewBaseName + (isProduction ? '.min' : ''),
				// Make sure Windows paths work down below
				cwdParts = cwd.replace(/\\/g, '/').split('/')
			;

			// Add specific js and css files to inject queue
			injectItems.push(config.export_assets + '/assets/js/' + viewName + '.js');
			injectItems.push(config.export_assets + '/assets/css/main' + (isProduction ? '.min' : '') + '.css')
			injectItems.push(config.export_assets + '/assets/css/' + viewName + '.css');

			// Put items in a stream and order dependencies
			injectItems = gulp.src(injectItems)
				.pipe(deporder(baseName));

			// On the current template
			gulp.src('templates/' + baseName)
				.pipe(plumber())
				// Piping newer() blocks refreshes on partials and layout parts :(
				//.pipe(newer(config.export_templates + '/' + baseName))
				.pipe(gulpif(config.assemble_templates, handlebars({
						templateName: baseName
					}, {
						batch: ['templates/layout', 'templates/partials'],
						helpers: {
							equal: function (v1, v2, options) {
								return (v1 == v2) ? options.fn(this) : options.inverse(this);
							}
						}
				})))
				.pipe(inject(injectItems, {
					ignorePath: [
						_.without(cwdParts, cwdParts.splice(-1)[0]).join('/')
					].concat(config.export_assets.split('/')),
					addRootSlash: false,
					addPrefix: config.template_asset_prefix
				}))
				.pipe(gulpif(config.minifyHTML, htmlminify({
					conditionals: true,
					comments: true
				})))
				.pipe(gulp.dest(config.export_templates))
				.pipe(gulpif(lrStarted, browserSync.reload({stream:true})))
			;

			// Since above changes are made in a tapped stream
			// We have to count to make sure everything is parsed
			// before continuing the build task
			count = count + 1;
			if(count == numTemplates) cb(null);
		}))
	;
});

// UNCSS ----------------------------------------------------------------------
// 
// Clean up unused CSS styles

gulp.task('uncss-main', function (cb) {

	// Quit this task if this isn't production mode
	if(!isProduction || !config.useUncss) {
		cb(null);
		return;
	}

	console.log(chalk.grey('Parsing and cleaning main stylesheet...'));

	// Grab all templates / partials / layout parts / etc
	var templates = globule.find(['templates/**/*.*', '!_*']);

	// Parse the main.scss file
	return gulp.src(config.export_assets + '/assets/css/main' + (isProduction ? '.min' : '') + '.css')
		.pipe(bytediff.start())
		.pipe(uncss({
			html: templates || [],
			ignore: config.uncssIgnore || []
		}))
		.pipe(bytediff.stop())
		.pipe(gulp.dest(config.export_assets + '/assets/css'))
	;
});

gulp.task('uncss-view', function (cb) {

	// Quit this task if this isn't production mode
	if(!isProduction || !config.useUncss) {
		cb(null);
		return;
	}

	var numViews = globule.find(config.export_assets + '/assets/css/view-*.css').length,
		count = 0;

	if(numViews) console.log(chalk.grey('Parsing and cleaning view stylesheet(s)...'));

	// Parse the view-*.scss files
	gulp.src(config.export_assets + '/assets/css/view-*.css')
		.pipe(tap(function (file, t) {

			var baseName = path.basename(file.path),
				nameParts = baseName.split('.'),
				viewBaseName = _.last(nameParts[0].split('view-')),

				// Grab all templates that aren't root files
				// aka views
				templates = globule.find([
					'templates/**/*.*',
					'!templates/*.*',
					'templates/' + viewBaseName + '.*',
					'!_*'
				])
			;

			gulp.src(config.export_assets + '/assets/css/' + baseName)
				.pipe(bytediff.start())
				.pipe(uncss({
					html: templates || [],
					ignore: config.uncssIgnore || []
				}))
				.pipe(bytediff.stop())
				.pipe(gulp.dest(config.export_assets + '/assets/css'))
				.pipe(tap(function (file) {

					// If this was the last file, end the task
					if(count === numViews) cb(null);
				}))
			;

			count = count + 1;
		}))
	;
});

// SERVER ---------------------------------------------------------------------
//

// Open served files in browser
function openBrowser () {

	console.log(
		chalk.cyan('Opening in'),
		chalk.magenta(config.browser)
	);
	open('http://' + connection.local + ':' + connection.port, config.browser);
}

// Open files in editor
function openEditor () {

	console.log(
		chalk.cyan('Editing in'),
		chalk.magenta(config.editor)
	);
	open(cwd, config.editor);
}

gulp.task('server', ['browsersync'], function (cb) {

	// JS specific watches to also detect removing/adding of files
	// Note: Will also run the HTML task again to update the linked files
	watch({
		glob: ['assets/js/**/view-*.js'],
		emitOnGlob: false,
		name: 'JS-VIEW',
		silent: true
	}, function() {
		sequence('scripts-view', 'templates');
	});

	watch({
		glob: ['assets/js/**/*.js', '!**/view-*.js'],
		emitOnGlob: false,
		name: 'JS-MAIN',
		silent: true
	}, function() {
		sequence('scripts-main', 'scripts-ie', 'templates');
	});

	// Watch images and call their task
	gulp.watch('assets/images/**/*', function () {
		gulp.start('images');
	});

	// Watch templates and call its task
	watch({
		glob: ['templates/**/*'],
		emitOnGlob: false,
		name: 'TEMPLATE',
		silent: true
	}, function() {
		sequence('templates');
	});
});

gulp.task('browsersync', function (cb) {
	
	// Serve files and connect browsers
	browserSync.init(null, {
		server: {
			baseDir: config.export_templates
		},
		logConnections: false,
		debugInfo: false,
		browser: 'none'
	}, function ( err, data) {

		// Store started state globally
		connection.external = data.options.external;
		connection.port = data.options.port;
		lrStarted = true;

		// Sass watch is integrated into task with a switch
		// based on the flag above
		gulp.start('sass-main');
		gulp.start('sass-ie');

		// Show some logs
		console.log(chalk.cyan('Local access at'), chalk.magenta('http://localhost:' + data.options.port));
		console.log(chalk.cyan('External access at'), chalk.magenta('http://' + connection.external + ':' + connection.port));

		// Copy the local url
		console.log(chalk.grey('Copied local url to clipboard!'));
		copy('http://localhost:' + data.options.port);

		// Process flags
		if(flags.open) openBrowser();
		if(flags.edit) openEditor();

		// Let's go!
		console.log(chalk.green('Ready ... set ... go!'));
	});

	cb(null);
});

// DEFAULT --------------------------------------------------------------------
//

gulp.task('default', function () {
	gulp.start('build');
});
