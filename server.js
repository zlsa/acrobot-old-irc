
var irc      = require("irc");
var Class    = require("class.extend");
var jsonfile = require("jsonfile");
var nlp      = require("./nlp");
var acrs     = require("./acronyms");
var util     = require("./util");
var phrases  = require("./phrases");

exports.CONFIG_VERSION = 1;

exports.is_valid_nick = function(nick) {
  var valid = new RegExp(/^[A-Za-z0-9_\-]+$/).test(nick);
  return valid;
};

exports.Server = Class.extend({
  init: function(acronyms, filename) {

    // these are defaults ONLY! they will be overwritten by config.json
    this.irc = {
      nick:      "acrobotic",
      server:    "irc.esper.net",
      channels: ["#acrobot"],
    };
      
    this.users = {
      // "zlsa": {
      //   admin:  false,
      //   ignore: false
      // }
    };

    this.mode = {
      debug: true,
      cheeky: false
    };

    this.cooldown = {};

    // acronyms
    this.acronyms = acronyms;

    // config filename
    this.filename = filename || "config.json";

    // IRC server
    this.bot = new irc.Client(this.irc.server, this.irc.nick, {
      channels: this.irc.channels,

      userName: this.irc.nick,
      realName: "Acrobot",
      autoConnect: false,
    });

    this.bind_irc_events();

  },

  // save/restore

  save: function(callback) {
    var server = this;
    
    jsonfile.writeFile(this.filename, {
      version: exports.CONFIG_VERSION,
      irc:     this.irc,
      users:   this.users,
      mode:    this.mode
    }, {
      spaces: 2
    }, function(err, obj) {
      if(err) {
        console.warn("could not save to file '" + server.filename + "'")
        return;
      }

      console.log("saved config to '" + server.filename + "'");
      
      if(callback) callback();
      
    });
  },

  restore: function(callback) {
    var server = this;

    jsonfile.readFile(this.filename, function(err, obj) {
      
      if(err) {
        console.log("could not open config file '" + server.filename + "'");
        // file doesn't exist yet, create it with the above defaults
        server.save();
        callback(null);
        return;
      }

      if(obj.version != exports.CONFIG_VERSION) {
        console.log("config file '" + server.filename + "' is older version");
        server.save();
        callback(null);
        return;
      }

      server.irc   = obj.irc;
      server.users = obj.users;
      server.mode  = obj.mode;
      
      console.log("restored config from '" + server.filename + "'");
      
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

  disconnect: function(callback) {
    this.bot.disconnect(callback);
    console.log("disconnected from irc server");
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

  // mode

  is_valid_mode: function(mode) {
    var valid_modes = [
      "debug",
      "cheeky"
    ];
    
    if(valid_modes.indexOf(mode) >= 0) return true;
    return false;
  },

  set_mode: function(mode, value) {
    this.mode[mode] = value;

    this.save();
  },

  enabled: function(mode) {
    if(this.mode[mode]) return true;
    return false;
  },

  is: function(mode) {
    if(this.enabled(mode)) {
      if(this.cooldown[mode] && this.cooldown[mode] > util.time()) return false;
      return true;
    }
    return false;
  },

  use: function(mode) {
    var delay = -1;
    if(mode == "cheeky") delay = 5;
    this.cooldown[mode] = util.time() + delay;
  },

  mode_message: function(mode, message, to) {
    if(this.is(mode)) {
      this.use(mode);
      this.notice(to, phrases.get(message));
    }
  },

  // users

  user_is: function(nick, status) {
    if(nick in this.users) {
      return this.users[nick][status];
    } else {
      return null;
    }
  },

  user_set: function(nick, status, value) {
    if(!(nick in this.users)) {
      this.users[nick] = {};
    }

    this.users[nick][status] = value;

    this.save();
  },

  // parsing

  parse_what: function(cfn, to) {

    if(cfn.subjects.length <= 0) {
      this.mode_message("cheeky", "incomplete-short-sentence", to);
      return;
    }

    var server = this;
    
    var got_acronyms = []; // avoid printing out duplicates

    for(var i=0; i<cfn.subjects.length; i++) {

      var acronym = acrs.clean(cfn.subjects[i]);

      if(got_acronyms.indexOf(acronym) >= 0) continue;
      got_acronyms.push(acronym);
      
      this.acronyms.get(acronym, function(err, matches) {
        
        if(matches.length >= 1) {
          var reply = [];
          for(var i=0; i<matches.length; i++) {
            var a = matches[i];
            reply.push(a.get_acronym() + ": " + a.get_initials());
          }
          
          server.notice(to, reply.join(", "));
        }
        
      });

    }

  },

  parse_natural: function(from, to, message) {
    var cfn = nlp.classify(this.irc.nick, message);

    this.notice("zlsa", JSON.stringify(cfn));

    if(cfn.action == "what") {
      this.parse_what(cfn, to);
    }
  },

  command_quit: function(from, to, message) {
    if(this.user_is(from, "admin"))
      this.disconnect();
    else
      this.notice(from, "you're not an admin!");
  },

  command_restart: function(from, to, message) {
    if(this.user_is(from, "admin"))
      process.exit();
    else
      this.notice(from, "you're not an admin!");
  },

  // USER FUNCTIONS (ADMIN)

  command_add_admin: function(from, to, nick) {
    if(!this.user_is(from, "admin")) {
      this.notice(from, "you're not an admin!");
      return;
    }
    
    if(!nick) {
      this.notice(from, "expected a nick to add as admin");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.notice(from, "invalid nick '" + nick + "'");
      return;
    }

    if(this.user_is(nick, "admin")) {
      this.notice(from, "'" + nick + "' is already an admin");
      return;
    }
    
    this.user_set(nick, "admin", true);
    this.notice(from, "'" + nick + "' is now an admin");
    this.notice(nick, "'" + from + "' has made you an admin");
  },

  command_remove_admin: function(from, to, nick) {
    if(!this.user_is(from, "admin")) {
      this.notice(from, "you're not an admin!");
      return;
    }
    
    if(!nick) {
      this.notice(from, "expected a nick to remove as admin");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.notice(from, "invalid nick '" + nick + "'");
      return;
    }

    if(nick == from) {
      this.notice(from, "you can't remove yourself as an admin");
      return;
    }
    
    if(!this.user_is(nick, "admin")) {
      this.notice(from, "'" + nick + "' already isn't an admin");
      return;
    }

    this.user_set(nick, "admin", false);
    this.notice(from, "'" + nick + "' is no longer an admin");
    this.notice(nick, "'" + from + "' has removed you as an admin");
  },

  // USER FUNCTIONS (ADMIN)

  command_add_ignore: function(from, to, nick) {
    if(!this.user_is(from, "admin")) {
      this.notice(from, "you're not an admin!");
    }
    
    if(!nick) {
      this.notice(from, "expected a nick to add to ignore list");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.notice(from, "invalid nick '" + nick + "'");
      return;
    }

    if(nick == from) {
      this.notice(from, "you can't ignore yourself");
      return;
    }
    
    if(this.user_is(nick, "ignored")) {
      this.notice(from, "'" + nick + "' is already ignored");
      return;
    }
    
    this.user_set(nick, "ignored", true);
    this.notice(from, "'" + nick + "' is now ignored");
  },

  command_remove_ignore: function(from, to, nick) {
    if(!this.user_is(from, "admin")) {
      this.notice(from, "you're not an admin!");
    }
    
    if(!nick) {
      this.notice(from, "expected a nick to remove from ignore list");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.notice(from, "invalid nick '" + nick + "'");
      return;
    }

    if(!this.user_is(nick, "ignore")) {
      this.notice(from, "'" + nick + "' already isn't ignored");
      return;
    }

    this.user_set(nick, "ignored", false);
    this.notice(from, "'" + nick + "' is no longer ignored");
  },

  // ADD FUNCTION

  command_add: function(from, to, message) {
    if(!message) {
      this.notice(from, "expected additional arguments to 'add'");
      return;
    }
    
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "admin") {
      this.command_add_admin(from, to, args);
    } else if(type == "ignore") {
      this.command_add_ignore(from, to, args);
    } else {
      this.notice(from, "expected one of [admin, ignore]");
    }

  },

  command_remove: function(from, to, message) {
    if(!message) {
      this.notice(from, "expected additional arguments to 'remove'");
      return;
    }
    
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "admin") {
      this.command_remove_admin(from, to, args);
    } else if(type == "ignore") {
      this.command_remove_ignore(from, to, args);
    } else {
      this.notice(from, "expected one of [admin, ignore]");
    }

  },

  command_mode: function(from, to, message) {
    if(!message) {
      this.notice(from, "expected two arguments to 'mode'");
      return;
    }
    
    var args = message.toLowerCase().split(/\s+/);

    if(args.length != 1 && args.length != 2) {
      this.notice(from, "expected one or two arguments to 'mode'");
      return;
    }

    var value = true;

    if(args.length == 2) {
      if(args[1] == "true"    ||
         args[1] == "on"      ||
         args[1] == "enabled") {
        value = true;
      } else if(args[1] == "false"    ||
                args[1] == "off"      ||
                args[1] == "disabled") {
        value = false;
      } else {
        this.notice(from, "expected second argument to be 'true' or 'false'");
        return;
      }
    }

    var mode = args[0];

    if(this.is_valid_mode(mode)) {
      this.set_mode(mode, value);
      this.notice(from, "'" + mode + "' has been set to " + this.enabled(mode));
    } else {
      this.notice(from, "invalid mode '" + mode + "'");
      return;
    }

  },

  command: function(from, to, command, message) {
    if(command == "quit" || command == "disconnect" || command == "leave") {
      this.command_quit(from, to, message);
    } else if(command == "restart") {
      this.command_restart(from, to, message);
      
    } else if(command == "add") {
      this.command_add(from, to, message);
    } else if(command == "remove") {
      this.command_remove(from, to, message);
      
    } else if(command == "mode") {
      this.command_mode(from, to, message);
    } else {
      this.notice(from, "unknown command");
    }
  },
        
  parse_command: function(from, to, message) {

    if(!message) {
      this.notice(from, "! expected a command");
      return;
    }

    var command = message.split(" ")[0].toLowerCase();

    this.command(from, to, command, message.substr(command.length + 1));

  },
  
  parse_message: function(from, to, message) {

    var server = this;
    
    if(from == this.irc.nick) return;

    if(this.user_is(from, "ignored"))
      return;
    
    message = message.trim();

    var type = "natural";

    if(to == this.irc.nick) type = "command";
    
    if(message.indexOf(this.irc.nick) == 0) {
      type = "command";
      var first_space = message.indexOf(" ");
      
      if(first_space <= 0) {
        message = "";
      } else {
        message = message.substr(first_space + 1);
      }
    }

    if(type == "natural") {
      this.parse_natural(from, to, message);
    } else if(type == "command") {
      this.parse_command(from, to, message);
    }

  }
  
});
