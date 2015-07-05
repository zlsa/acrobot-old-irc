
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

exports.is_valid_channel = function(channel) {
  var valid = new RegExp(/^\#[A-Za-z0-9_\-]+$/).test(channel);
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
      cheeky: false,
      silent: false
    };

    this.mode_cooldown = {};

    // acronyms
    this.acronyms = acronyms;

    // config filename
    this.filename = filename || "config.json";

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

    if(!this.bot) {
      this.bot = new irc.Client(this.irc.server, this.irc.nick, {
        channels: this.irc.channels,

        userName: this.irc.nick,
        realName: "Acrobot",
        autoConnect: false,
      });

      this.bind_irc_events();

    }

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

  say: function(to, message) {
    this.bot.say(to, message);
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

  join_channel: function(channel) {
    if(this.irc.channels.indexOf(channel) >= 0) {
      return false;
    }
    
    this.bot.join(channel);
    this.irc.channels.push(channel);

    this.save();
    
    return true;
  },

  part_channel: function(channel) {
    channel = channel.toLowerCase();
    if(this.irc.channels.indexOf(channel) < 0) {
      return false;
    }

    this.bot.part(channel);
    
    this.save();
    
    return true;
  },

  // mode

  is_valid_mode: function(mode) {
    var valid_modes = [
      "debug",
      "cheeky",
      "silent"
    ];
    
    if(valid_modes.indexOf(mode) >= 0) return true;
    return false;
  },

  set_mode: function(mode, value) {
    this.mode[mode] = value;

    this.save();
  },

  mode_enabled: function(mode) {
    if(this.mode[mode]) return true;
    return false;
  },

  mode_is: function(mode) {
    if(this.mode_enabled(mode)) {
      if(this.mode_cooldown[mode] && this.mode_cooldown[mode] > util.time()) return false;
      return true;
    }
    return false;
  },

  use_mode: function(mode) {
    var delay = -1;
    if(mode == "cheeky") delay = 5;
    this.mode_cooldown[mode] = util.time() + delay;
  },

  mode_message: function(mode, message, to) {
    if(this.mode_is(mode)) {
      this.use_mode(mode);
      this.say(to, phrases.get(message));
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

  users_get: function(nick, status, value) {
    var users = [];
    
    for(var i in this.users) {
      var u = this.users[i];
      if(u[status] == value) users.push(i);
    }
    
    return users;
  },

  print_acronyms: function(acronyms, to, description, always) {
    if(description == undefined) description = true;
    
    var server = this;

    var got_acronyms = []; // avoid printing out duplicates

    for(var i=0; i<acronyms.length; i++) {

      var acronym = acrs.clean(acronyms[i]);

      if(got_acronyms.indexOf(acronym) >= 0) continue;
      got_acronyms.push(acronym);
      
      this.acronyms.get(acronym, function(err, matches) {
        
        if(matches.length >= 1) {
          var reply = [];
          for(var i=0; i<matches.length; i++) {
            var a = matches[i];
            if(description && a.get_description())
              reply.push(a.get_acronym() + ": " + a.get_initials() + ". " + a.get_description());
            else
              reply.push(a.get_acronym() + ": " + a.get_initials());
          }
          
          server.say(to, reply.join(", "));
        } else if(always) {
          server.say(to, "could not find an acronym matching '" + acronym + "'");
        }
        
      });

    }
    
  },

  // parsing

  parse_what: function(cfn, to) {

    if(cfn.subjects.length <= 0) {
      this.mode_message("cheeky", "incomplete-short-sentence", to);
      return false;
    }

    this.print_acronyms(cfn.subjects, to);

    return true;
    
  },

  parse_natural: function(from, to, message) {
    var cfn = nlp.classify(this.irc.nick, message);

    if(cfn.action == "what") {
      return this.parse_what(cfn, to);
    }

    return false;
    
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

  command_list_admins: function(from, to, message) {
    var users = this.users_get("admin", true);

    if(users.length == 0) {
      this.notice(from, "none found");
    } else {
      this.notice(from, nlp.andify(users));
    }
  },

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

  // USER FUNCTIONS (IGNORE)

  command_list_ignored: function(from, to, message) {
    var users = this.users_get("ignored", true);

    if(users.length == 0) {
      this.notice(from, "none found");
    } else {
      this.notice(from, nlp.andify(users));
    }
  },

  command_add_ignore: function(from, to, nick) {
    if(!this.user_is(from, "admin")) {
      this.notice(from, "you're not an admin!");
      return;
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
      return;
    }
    
    if(!nick) {
      this.notice(from, "expected a nick to remove from ignore list");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.notice(from, "invalid nick '" + nick + "'");
      return;
    }

    if(!this.user_is(nick, "ignored")) {
      this.notice(from, "'" + nick + "' already isn't ignored");
      return;
    }

    this.user_set(nick, "ignored", false);
    this.notice(from, "'" + nick + "' is no longer ignored");
  },

  // CHANNEL FUNCTIONS

  command_channel: function(from, to, message) {
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "join") {
      this.command_add_channel(from, to, args);
    } else if(type == "part") {
      this.command_remove_channel(from, to, args);
    } else if(type == "list") {
      this.command_list_channels(from, to, args);
    } else {
      this.notice(from, "expected one of [join, part, list]");
    }

  },

  command_list_channels: function(from, to, message) {
    this.notice(from, nlp.andify(this.irc.channels));
  },

  command_add_channel: function(from, to, channel) {
    if(!this.user_is(from, "admin")) {
      this.notice(from, "you're not an admin!");
      return;
    }
    
    if(!exports.is_valid_channel(channel)) {
      this.notice(from, "invalid channel name '" + channel + "'");
      return;
    }

    if(!this.join_channel(channel)) {
      this.notice(from, "already joined " + channel);
      return;
    }
    
    this.notice(from, "joined " + channel);
  },

  command_remove_channel: function(from, to, channel) {
    if(!this.user_is(from, "admin")) {
      this.notice(from, "you're not an admin!");
      return;
    }
    
    if(!channel) {
      if(to[0] == "#") {
        channel = to;
      } else {
        this.notice(from, "cannot part from private chat");
        return;
      }
    }
    
    if(!exports.is_valid_channel(channel)) {
      this.notice(from, "invalid channel name '" + channel + "'");
      return;
    }

    if(this.irc.channels.length == 1) {
      this.notice(from, "cannot part last channel");
      return;
    }

    if(!this.part_channel(channel)) {
      this.notice(from, "already parted " + channel);
      return;
    }
    
    this.notice(from, "parted " + channel);
  },

  // ADD FUNCTION

  command_list: function(from, to, message) {
    if(!message) {
      this.notice(from, "expected additional arguments to 'list'");
      return;
    }
    
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "admin" || type == "admins") {
      this.command_list_admins(from, to, args);
    } else if(type == "ignore" || type == "ignored") {
      this.command_list_ignored(from, to, args);
    } else if(type == "channel" || type == "channels") {
      this.command_list_channels(from, to, args);
    } else {
      this.notice(from, "expected one of [admins, ignored, channels]");
    }

  },

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
    } else if(type == "channel") {
      this.command_add_channel(from, to, args);
    } else {
      this.notice(from, "expected one of [admin, ignore, channel]");
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
    } else if(type == "channel") {
      this.command_remove_channel(from, to, args);
    } else {
      this.notice(from, "expected one of [admin, ignore, channel]");
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
      var old_mode = this.mode_enabled(mode);
      this.set_mode(mode, value);
      this.notice(from, "'" + mode + "' (was " + old_mode + ") has been set to " + this.mode_enabled(mode));
    } else {
      this.notice(from, "invalid mode '" + mode + "'");
      return;
    }

  },

  command_define: function(from, to, message) {
    if(!message) {
      this.notice(from, "expected acronym(s)");
      return;
    }
    
    var acronyms = nlp.split_acronyms(message.toLowerCase());

    this.print_acronyms(acronyms, to, true, true);

  },

  command: function(from, to, command, message) {
    
    if(command == "quit" || command == "disconnect" || command == "leave") {
      this.command_quit(from, to, message);
    } else if(command == "restart") {
      this.command_restart(from, to, message);
      
    } else if(command == "define") {
      this.command_define(from, to, message);
      
    } else if(command == "list") {
      this.command_list(from, to, message);
      
    } else if(command == "admins") {
      this.command_list_admins(from, to, message);
      
    } else if(command == "channels") {
      this.command_list_channels(from, to, message);
      
    } else if(command == "channel") {
      this.command_channel(from, to, message);
      
    } else if(command == "add") {
      this.command_add(from, to, message);
    } else if(command == "remove") {
      this.command_remove(from, to, message);
      
    } else if(command == "ignore") {
      this.command_add_ignore(from, to, message);
    } else if(command == "unignore") {
      this.command_remove_ignore(from, to, message);
      
    } else if(command == "join") {
      this.command_add_channel(from, to, message);
    } else if(command == "part") {
      this.command_remove_channel(from, to, message);
      
    } else if(command == "mode") {
      this.command_mode(from, to, message);
    } else {
      this.notice(from, "unknown command '" + command + "'");
    }
  },
        
  parse_command: function(from, to, message) {

    if(!message) {
      this.notice(from, "expected a command");
      return;
    }

    var command = message.split(" ")[0].toLowerCase();

    this.command(from, to, command, message.substr(command.length + 1));

  },
  
  parse_message: function(from, to, message) {

    if(from == this.irc.nick)
      return;

    if(this.user_is(from, "ignored"))
      return;

    var server = this;
    
    message = message.trim();

    var type   = "natural";
    var direct = false;

    if(to == this.irc.nick) direct = true;
    
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
      if(this.mode_is("silent"))
        return;
      this.parse_natural(from, to, message);
    }

    if(direct || type == "command") {
      if(direct)
        to = from;
      this.parse_command(from, to, message);
    }

  }
  
});
