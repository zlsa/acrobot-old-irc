
var jsonfile = require("jsonfile");

exports.phrases = {};

function randint(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

exports.randint = randint;

jsonfile.readFile("phrases.json", function(err, obj) {
  
  if(err) {
    console.log("could not open file 'phrases.json'");
    return;
  }
  
  exports.phrases = obj;
  
})

exports.get = function(phrase) {
  if(!(phrase in exports.phrases)) return "";
  var choices = exports.phrases[phrase];

  return choices[randint(0, choices.length)];
};
