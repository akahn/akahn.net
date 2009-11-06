var AK = {
  apiKey:  "de24e7cfd602218871fc8e30b3dd8a5f",
  message: "Facebook Connect is easy!",
  attachment: {
    name: "Updating from akahn.net",
    caption: "So cool!",
    href: "http://www.akahn.net/",
    media: [{
      type: "image",
      src:  "http://farm4.static.flickr.com/3314/3273040332_e48044d08a.jpg",
      href: "http://www.akahn.net"
    }]
  },
};

$(document).ready(function() {
  FB.init(AK.apiKey, "/xd_comm.html");
  $('.connect').click(function(e) {
    FB.ensureInit(function() {
      FB.Connect.streamPublish(AK.message, AK.attachment);
    });
    return false;
  });
});
