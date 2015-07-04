
var irc      = require("irc");
var Class    = require("class.extend");
var jsonfile = require("jsonfile");

exports.Server = Class.extend({
  init: function(acronyms) {

    // these are defaults ONLY! they will be overwritten by config.json
    this.irc = {
      nick:      "acrobot",
      server:    "irc.esper.net",
      channels: ["#acrobot"],
    };
      
    this.users = {
      "zlsa": {
        admin:  false,
        ignore: false
      }
    };

    // acronyms
    this.acronyms = acronyms;

    // config filename
    this.filename = "config.json";

    // IRC server
    this.bot = new irc.Client(this.irc.server, this.irc.nick, {
      channels: this.irc.channels,

      userName: this.irc.nick,
      realName: "Acrobot",
      autoRejoin: true,
      autoConnect: false,
      floodProtection: true,
      floodProtectionDelay: 25,
    });

    this.bind_irc_events();

  },

  // save/restore

  save: function(callback) {
    var server = this;
    
    jsonfile.writeFile(this.filename, {
      irc: this.irc,
      users: this.users
    }, {
      spaces: 2
    }, function(err, obj) {
      if(err) {
        console.warn("could not save to file '" + server.filename + "'")
        return;
      }
      
      if(callback) callback();
      
    });
  },

  restore: function(callback) {
    var server = this;

    jsonfile.readFile(this.filename, function(err, obj) {
      
      if(err) {
        // file doesn't exist yet, create it with the above defaults
        server.save();
        return;
      }

      server.irc   = obj.irc;
      server.users = obj.users;
      
      if(callback) callback(obj);
      
    });
  },

  // IRC connection

  connect: function(callback) {
    var server = this;
    this.bot.connect(5, function() {
      if(callback) callback();
    });
  },

  notice: function(to, message) {
    this.bot.notice(to, message);
  },

  bind_irc_events: function() {
    var server = this;
    
    this.bot.addListener("message", function (from, to, message) {
      server.parse_message.call(server, from, to, message);
    });
    
    this.bot.addListener("notice", function (nick, to, message) {
      if(nick != undefined)
        server.parse_message.call(server, nick, to, message);
    });
    
  },

  parse_message: function(from, to, message) {
    if(from == this.irc.nick) return;
    
    console.log(from + " => " + to + ": '" + message + "'");

    this.notice(from, "you said '" + message + "'");
  }
  
});

