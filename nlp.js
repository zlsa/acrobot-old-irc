
function escape_regexp(string) {
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

function replace_all(string, find, replace) {
  return string.replace(new RegExp(escape_regexp(find), "g"), replace);
}

exports.andify = function(list) {
  if(list.length == 0) {
    return "";
  } else if(list.length == 1) {
    return list[0];
  } else {
    var s = "";
    s += list.slice(0, list.length-1).join(", ");
    s = s.substr(0, s.length);
    if(list.length > 2) s += ",";
    s += " and " + list[list.length-1];
    return s;
  }
};

exports.split_acronyms = function(text) {
  var acronyms = text.split(/\s+|and/g);
  var a = [];
  
  for(var i=0; i<acronyms.length; i++) {
    if(acronyms[i]) a.push(acronyms[i]);
  }
  
  return a;
};

exports.preprocess = function(text) {
  var string = replace_all(text.toLowerCase(), "'s", " is");
  string = replace_all(string, "?", "");
  
  var words  = string.split(/\s+/g);
  
  return words;
};

exports.classify_what = function(me, words) {
  var cfn = {};
  cfn.action = "what";
  
  var offset = 1;

  if(words[0] == "explain") offset += 1; // skip over "is/are"
  
  if(offset == 1 &&
     (words[offset] == "is" ||
      words[offset] == "are" ||
      words[offset] == "does")
     && words.length >= 2) offset += 1;
  if(offset == 2 &&
     (words[offset] == "the" ||
      words[offset] == "a" ||
      words[offset] == "an")
     && words.length >= 3) offset += 1;

  var subjects = exports.split_acronyms(words.slice(offset).join(" "));

  cfn.subjects = [];
  
  for(var i=0; i<subjects.length; i++) {
    // ignore last word if == "mean"
    // "what does iss mean?"
    if((i == (subjects.length - 1)) && subjects[i] == "mean") break;
    if(subjects[i]) cfn.subjects.push(subjects[i]);
  }
  
  return cfn;
};

exports.classify = function(me, text) {
  words = exports.preprocess(text);

  if(words.length >= 1) {

    if(words[0] == "what" || words[0] == "who" || words[0] == "explain") {
      return exports.classify_what(me, words);
    }
  }

  return {};

};
