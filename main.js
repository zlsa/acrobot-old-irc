
var Server   = require("./server").Server;
var acronyms = require("./acronyms");

var server   = new Server(new acronyms.JSONAcronyms());

server.restore(function() {
  
  server.connect(function() {
    console.log("connected to irc server");
  });
  
});
