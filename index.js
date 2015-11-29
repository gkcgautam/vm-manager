#!/usr/bin/env node --harmony

var program = require('commander');
var chalk = require('chalk');
var exec = require('child_process').exec;
var fileExists = require('file-exists');
var jsonFile = require('jsonfile')
var util = require('util');
var _ = require('underscore');

var VMS = null; // Config is loaded into this variable
var CMD_START_VM = 'vboxmanage startvm %s --type headless';
var CMD_STOP_VM = 'vboxmanage controlvm %s poweroff';
var CMD_MOUNT_VM = 'sshfs -p %d %s@%s:%s %s';
var CMD_UNMOUNT_VM = 'umount -f %s';
var MOUNT_DELAY = 10; // Default 10 secs

program
    .arguments('<operation> [vm]')
    .action(function (operation, vmName) {
        if (!_.contains(['start', 'stop', 'mount', 'unmount'], operation)) {
            console.error(makeErrorMsg('Invalid operation', operation));
            return;
        }

        var configFilePath = getUserHome() + '/vvm.config.json';
        if (!fileExists(configFilePath)) {
            console.error(makeErrorMsg('Could not find config file ', configFilePath));
            return;
        }

        VMS = jsonFile.readFileSync(configFilePath, {throws: false});
        if (!VMS) {
            console.error(makeErrorMsg('Failed to parse config file ', configFilePath));
            return;
        }

        if (!_.has(VMS, vmName)) {
            console.error(makeErrorMsg('No config available for', vmName));
            return;
        }

        var vm = VMS[vmName];

        if (!_.has(vm, 'name')) {
            console.error(makeErrorMsg('Incorrect config - VM name missing'));
            return;
        }

        if (operation === 'start') {
            if (isMountableVM(vm)) {
                startAndMountVM(vm);
            } else {
                startVM(vm);
            }
        }
        else if (operation === 'stop') {
            if (isMountableVM(vm)) {
                unmountAndStopVM(vm);
            } else {
                stopVM(vm);
            }
        }
        else if (operation === 'mount') {
            if (!isMountableVM(vm)) {
                console.error(makeErrorMsg('Missing mount config.'));
            } else {
                mountVM(vm);
            }
        }
        else if (operation === 'unmount') {
            if (!isMountableVM(vm)) {
                console.error(makeErrorMsg('Missing mount config.'));
            } else {
                unmountVM(vm);
            }
        }
    })
    .parse(process.argv);

function getUserHome() {
    return process.env.HOME || process.env.USERPROFILE;
}

function isMountableVM(vm) {
    return _.has(vm, 'username') && _.has(vm, 'mount_point_host');
}

function startAndMountVM(vm) {
    return startVM(vm, function(){
        mountVM(vm);
    });
}

function unmountAndStopVM(vm) {
    return unmountVM(vm, function(){
        stopVM(vm);
    });
}

function startVM(vm, callback) {
    var cmd = util.format(CMD_START_VM, vm['name']);
    //console.log(cmd);

    exec(cmd, function(error, stdout, stderr) {
        if (stdout !== null) {
            console.log(chalk.gray(stdout));
        }

        if (stderr !== null) {
            console.log(chalk.red(stderr));
        }

        if (error !== null && error['code'] == 1) {
            console.error(makeErrorMsg('Failed to start VM'));
            return;
        }

        console.log(chalk.green('Yo! VM is up and running.'));

        if (callback && _.isFunction(callback)){
            callback();
        }
    });
}

function stopVM(vm) {
    var cmd = util.format(CMD_STOP_VM, vm['name']);
    console.log(chalk.gray('Stopping VM...'));

    exec(cmd, function(error, stdout, stderr) {
        if (error !== null && error['code'] == 1) {
            if (stderr !== null) {
                console.log(chalk.red(stderr));
            }
            console.error(makeErrorMsg('Failed to stop VM'));
            return;
        } else {
            // The poweroff progress is also returned in stderr
            if (stderr !== null) {
                console.log(chalk.gray(stderr));
            }
        }

        console.log(chalk.green('Bye!'));
    });
}

function mountVM(vm) {
    // Set 22 as the default remote ssh port
    if (!_.has(vm, 'ssh_port')) {
        vm['ssh_port'] = 22;
    }

    // Set localhost as the default remote hostname
    if (!_.has(vm, 'hostname')) {
        vm['hostname'] = 'localhost';
    }

    // Set remote home dir as the default remote mount point 
    if (!_.has(vm, 'mount_point_remote')) {
        vm['mount_point_remote'] = util.format('/home/%s/', vm['username']);
    }

    var cmd = util.format(CMD_MOUNT_VM,
        vm['ssh_port'],
        vm['username'],
        vm['hostname'],
        vm['mount_point_remote'],
        vm['mount_point_host']);

    console.log(chalk.gray('Mounting VM...'));

    var delay = _.has(vm,'mount_delay') ? vm['mount_delay']:MOUNT_DELAY; // In seconds

    setTimeout(function(){
        exec(cmd, function(error, stdout, stderr) {
            // sshfs never returns anything on stdout

            if (stderr !== null) {
                console.log(chalk.red(stderr));
            }

            if (error !== null && error['code'] == 1) {
                console.error(makeErrorMsg('Failed to mount VM'));
                return;
            }

            console.log(chalk.gray('VM mounted at ') + chalk.bold(vm['mount_point_host']));
        });
    }, delay*1000);
}

function unmountVM(vm, callback) {
    var cmd = util.format(CMD_UNMOUNT_VM, vm['mount_point_host']);
    console.log(chalk.gray('Unmounting VM...'));

    exec(cmd, function(error, stdout, stderr) {
        // We won't be getting anything on stdout

        if (stderr !== null) {
            console.log(chalk.red(stderr));
        }

        if (error !== null && error['code'] == 1) {
            console.error(makeErrorMsg('Failed to unmount VM'));
        } else {
            console.log(chalk.gray('VM has been unmounted.'));
        }

        if (callback && _.isFunction(callback)){
            callback();
        }
    });
}

function makeErrorMsg(error, val) {
    return chalk.underline.red('ERROR') + 
        chalk.red(': ' + error) + 
        (val ? chalk.magenta(' ' + val) : '');
}