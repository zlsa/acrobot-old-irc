
var Server   = require("./server").Server;
var acronyms = require("./acronyms");

var ja       = new acronyms.JSONAcronyms("acronyms.json");
var server   = new Server(ja);

ja.restore(function() {
  
  server.restore(function () {
    
    server.connect(function() {
      console.log("connected to irc server");
    });
    
  });

});
