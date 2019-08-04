// Evohome Status node
const evohome = require('./evohome.js');
module.exports = function(RED) {
    'use strict';

    function Node(n) {
        RED.nodes.createNode(this,n);
        var confignode = RED.nodes.getNode(n.confignode);
        var globalContext = this.context().global;
        var node = this;
        var renew;
        this.interval = parseInt(n.interval);

        function publishEvohomeStatus() {
            if (!globalContext.get('evohome-session')) {
            	evohome.login(confignode.userid, confignode.passwd).then(function(session) {
                    globalContext.set('evohome-session', session);
                    renew = setInterval(function() {
                        renewSession();
                    }, session.refreshTokenInterval * 1000);
                }).fail(function(err) {
                    node.warn(err);
                });
            } else {
                var session = globalContext.get('evohome-session');
	        session.getLocations().then(function(locations) {
                    session.getThermostats(locations[0].locationID).then(function(thermostats){
                        session.getSystemModeStatus(locations[0].locationID).then(function(systemModeStatus){
                            // iterate through the devices
                            for (var deviceId in locations[0].devices) {
                                for(var thermoId in thermostats) {
                                    if(locations[0].devices[deviceId].zoneID == thermostats[thermoId].zoneId) {
                                        if(locations[0].devices[deviceId].name  == "") {
                                            // Device name is empty
                                            // Probably Hot Water
                                            // Do not store
                                            console.log("Found blank device name, probably stored hot water. Ignoring device for now.");
                                        } else {
                                            var msgout = {
                                                payload : {
                                                    id: thermostats[thermoId].zoneId,
                                                    name : locations[0].devices[deviceId].name.toLowerCase(),
                                                    currentTemperature : thermostats[thermoId].temperatureStatus.temperature,
                                                    targetTemperature : thermostats[thermoId].setpointStatus.targetHeatTemperature
                                                }
                                            }
                                            node.send(msgout);
                                        }
                                    }
                                }
                            }
                        }).fail(function(err){
                            node.warn(err);
                        });
                    }).fail(function(err){
                        node.warn(err);
                    });
                }).fail(function(err) {
                    node.warn(err);
                });
            }
        }

        var tick = setInterval(function() {
            publishEvohomeStatus();
        }, this.interval * 1000); // trigger every 30 secs

        node.on("close", function() {
            if (tick) {
                clearInterval(tick);
            }

            if (renew) {
                clearInterval(renew);
            }
        });

        function renewSession() {
console.log('renew');
            var session = globalContext.get('evohome-session');
            session._renew().then(function(json) {
                // renew session token
                clearInterval(renew);
                session.sessionId = "bearer " + json.access_token;
                session.refreshToken = json.refresh_token;
                globalContext.set('evohome-session', session);
                renew = setInterval(function() {
                        renewSession();
                    }, session.refreshTokenInterval * 1000);
                console.log("Renewed Honeywell API authentication token!");
            }).fail(function(err) {
                globalContext.set('evohome-session', undefined);
                node.warn('Renewing Honeywell API authentication token failed:', err);
            });
        }
    }

    RED.nodes.registerType('evohome-status', Node);
};