// http://stackoverflow.com/questions/19673743/how-do-i-use-os-file-open
const {Cu} = require("chrome");
const {TextEncoder, OS} = Cu.import("resource://gre/modules/osfile.jsm", {});
const {Task} = Cu.import("resource://gre/modules/Task.jsm", {});
const {FileUtils} = Cu.import("resource://gre/modules/FileUtils.jsm");

var buttons = require('sdk/ui/button/action');
var tabs = require("sdk/tabs");
var Request = require("sdk/request").Request;
var fileIO = require("sdk/io/file");
var urls = require("sdk/url");
var fileopen = require("file-dialog");

var CHUNKSIZE = 8096;

// https://developer.mozilla.org/en-US/Add-ons/SDK/High-Level_APIs/request

// this requires a couple of changes to onionshare: range support in http,
// and perhaps structred data in the page for url, length, and checksum

// Listen for tab openings.
// tabs.on('open', function onOpen(tab) {
//   myOpenTabs.push(tab);
// });

// Listen for tab content loads.
tabs.on('ready', function(tab) {
  console.log('tab is loaded', tab.title, tab.url);
  tab.attach({
    contentScript: 'var message=null; if (document.querySelector("meta[name=onionshare-filename]")) { message = [document.querySelector("meta[name=onionshare-filename]").getAttribute(\"content\"), document.querySelector("meta[name=onionshare-filesize]").getAttribute(\"content\"), document.querySelector("meta[name=onionshare-filehash]").getAttribute(\"content\")].join(\",\") }; self.postMessage(message);',
    onMessage: function (message) {
      if (message) {
        button.state("tab", {disabled:false});
        button.on("click", function(state) { handleClick(state, message) });
      } else {
        button.state("tab", {disabled:true});
      }
      console.log(message);
    }
  });
});

var button = buttons.ActionButton({
  id: "onionshare",
  label: "Download Onionshare File",
  icon: {
    "16": "./icon-16.png",
    "32": "./icon-32.png",
    "64": "./icon-64.png"
  },
  disabled: true
});

// create a new metadata structure for this file
function new_meta_struct(len, chunk_size) {
  var ret = [];
  i = 0;
  for (var offset = 0; offset < len; offset += chunk_size) {
    var chunk_start = offset;
    var chunk_len = chunk_size;
    if (chunk_start + chunk_len > len) { chunk_len = len - chunk_start}
    var chunk_meta = {
      index: i,
      offset: chunk_start,
      length: chunk_len,
      status: "missing"
    };
    
    ret.push(chunk_meta);
    i = i + 1;
  }
  
  return ret;
}

function readMeta(path) {
  var meta = fileIO.open(path, "rb");
  var data = meta.read();
  meta.close();
  var metadata = JSON.parse(data);
  return metadata;
}

function findNeededBlock(meta) {
  // filter chunks into needed ones
  // choose random one
  // return that one, or null for done
  function is_needed(element) {
    if (!element) return false; // sometimes element is null here?
    return element['status'] == "missing";
  }
  
  var neededs = meta.filter(is_needed);

  if (neededs.length == 0) { return null; }

  var item = neededs[Math.floor(Math.random()*neededs.length)];

  return item;
}

// called at startup, indicating new run of the plugin. we
// assume we're retrying the download, so any inflight chunks need
// to be restarted.
function cleanMeta(path) {
  var meta = readMeta(path);
  
  function is_inflight(element) {
    if (!element) return false; // sometimes element is null here?
    return element['status'] == "inflight";
  }
  
  var flights = meta.filter(is_inflight);
  flights.forEach(function(elem) {
    elem['status'] = "missing";
    meta[ elem['index'] ] = elem;
  })
  
  saveMeta(path, meta);
}

function saveMeta(path, meta_struct) {
  var meta = fileIO.open(path, "wb");
  
  meta_struct = JSON.stringify(meta_struct);
  
  meta.write(meta_struct);
  meta.close();
}

function initMeta(path, len) {
  var meta_struct = new_meta_struct(len, CHUNKSIZE);
  saveMeta(path, meta_struct);
}

// function initPart(path, len) {
//   var part = fileIO.open(path, "wb");
//   part.write(Array(len + 1).join(0));
//   part.close();
// }

function reserveBlock(needed_block, path) {
  meta = readMeta(path);
  needed_block['status'] = "inflight";
  block_id = needed_block['index'];
  meta[block_id] = needed_block;
  
  saveMeta(path, meta);

  return meta;
}

function completeBlock(chunk, path) {
  meta = readMeta(path);
  chunk['status'] = "complete";
  block_id = chunk['index'];
  meta[block_id] = chunk;
  
  saveMeta(path, meta);

  return meta;
}

function writePart(chunk, part_path, data) {
  var index = chunk['index'];
  var path = part_path + "." + index;

  var part = fileIO.open(path, "wb");
  part.write(data);
  part.close();

  console.log("Stored chunk " + index);
}

function fetchBlock(url, chunk, meta, meta_path, part_path, fn) {
  var endbyte = chunk['offset'] + chunk['length'];
  var range = "" + chunk['offset'] + "-" + endbyte;
  
  var req = Request({
    // url: "http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html",
    url: url,
    overrideMimeType: "text/plain; charset=latin1",
    headers: { "range": "bytes=" + range },
    onComplete: function (response) {
      // we assume for now request completed correctly.
      writePart(chunk, part_path, response.text);
      completeBlock(chunk, meta_path);
      loaders -= 1;
      spawnLoader(meta_path, part_path, url, fn);
    }
  });

  req.get();
}

var loaders = 0;

function spawnLoader(meta_path, part_path, url, fn) {
  
  if (loaders < 3) {
    loaders += 1;
    meta = readMeta(meta_path);
    needed_block = findNeededBlock(meta);
    if (needed_block) {
      meta = reserveBlock(needed_block, meta_path);
      fetchBlock(url, needed_block, meta, meta_path, part_path, fn);
      spawnLoader(meta_path, part_path, url, fn);
    } else {
      console.log("Everything is either in flight or completed.");
      loaders -= 1;
      maybeCleanup(meta_path, part_path, fn);
    }
  } else {
    console.log("Already have three downloaders going!");
  }
}

function maybeCleanup(meta_path, part_path, fn) {
  meta = readMeta(meta_path);

  console.log("fn is " + fn);
  
  function is_not_complete(element) {
    if (!element) return false; // sometimes element is null here?
    return element['status'] != "complete";
  }
  
  var incomplete = meta.filter(is_not_complete);

  if (incomplete.length) {
    console.log("Incomplete is " + incomplete);
  } else {
    console.log("I am totally done now.");
    // we want this to ever run exactly once.
    var result = fileIO.open(fn, "wb");
    console.log("I was able to open " + fn);
    meta.forEach(function(elem) {
      var ix = elem['index'];
      console.log("Index is " + ix);
      var partfn = part_path + "." + ix;
      var part = fileIO.open(partfn, "rb");
      var data = part.read();
      result.write(data);
      part.close();
      // part.unlink!
    });
    result.close();
  }
}

function handleClick(state, message) {
  var tab = tabs.activeTab;
  console.log("This tab's title is " + tab.title);
  console.log("The message was " + message);

  // many thanks https://github.com/swiperthefox/file-dialog
  var targets = fileopen.openModalFileDialog(fileopen.modeGetFolder, [], "Download directory");
  var target = targets[0];
    
  var ma = message.split(',');
  var fn = ma[0];
  var size = ma[1];
  var checksum = ma[2];
  
  base_url = urls.URL(tab.url);
  host = base_url.host;
  port = base_url.port;
  path = base_url.path;

  path = path.replace("/", "");

  var url = "http://" + host + ":" + port + "/" + path + "/download";

  var target_tmpdir = target + "/." + path;
  fileIO.mkpath(target_tmpdir);

  var meta_path = target_tmpdir + "/meta";
  var part_path = target_tmpdir + "/part";

  var full_path = target + "/" + fn;

  if (!fileIO.exists(meta_path)) {
    initMeta(meta_path, size);
  }

  cleanMeta(meta_path);
  
  // if (!fileIO.exists(part_path)) {
  //   initPart(part_path, size);
  // }

  spawnLoader(meta_path, part_path, url, full_path);
}
