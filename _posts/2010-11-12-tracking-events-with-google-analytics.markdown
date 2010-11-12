---
title: "Tracking Events With Google Analytics"
layout: blog
published: true
---

Did you know you can track custom events with Google Analytics? It's true; you can. It's easy. Just take your Google Analytics asynchronous queue object, `_gaq`, and push an array onto it:

{% highlight js %}
_gaq.push(['_trackEvent', 'accounts', 'signup', 'homepage']);
{% endhighlight %}

`_trackEvent` is the method, `accounts` is the category, `signup` is the action, and `homepage` is the label. There is an additional parameter we can provide, `value`, if our event has a numerical value that we'd like to view in aggregate later on.

Typically, you'd set this up to happen upon a certain user action. For example, using jQuery:

{% highlight js %}
$('#signup-form').submit(function() {
  _gaq.push(['_trackEvent', 'accounts', 'signup', 'homepage']);
});
{% endhighlight %}

When a user submits the signup form, we track the event in Google Analytics.

If you need to handle many events, a more robust solution would be to describe these events in markup rather than JavaScript. In this example, for tracking clicks that download files, I place a data-attribute on links whose clicks you'd like to track:

{% highlight js %}
// Given HTML like this:
// <a href="/download.pdf" data-track>Download as PDF</a>

$('a [data-track']).click(function(event) {
  var label = this.innerHTML,
      file  = this.pathname;
  _gaq.push(['_trackEvent', 'downloads', file, label);
});
{% endhighlight %}

Now our data about this download is read from the markup, rather than specified up-front in our JavaScript.

### Tracking Pageviews

The stock Google Analytics snippet contains a call to `_trackPageview`. On typical web pages we call this function once, for each page the user loads in their browser. On fancy single-page apps that navigate based on the URL hash, we may want to track each hash-based navigation as a pageview. In a Sammy app, for example, we could do this using the `after` hook:

{% highlight js %}
$.sammy(function() {
  // Set up some routes

  this.after(function() {
    _gaq.push(['_trackPageview']);
  });
});
{% endhighlight %}

Now we're tracking navigation within the single-page app: our after function is called each time the user navigates to another route in the Sammy app. Simple!

### Wrapping Up

For more detail, check out [Google's trackEvent reference](http://code.google.com/apis/analytics/docs/tracking/eventTrackerGuide.html). Also, be sure to read Mathias Bynens' [excellent post](http://mathiasbynens.be/notes/async-analytics-snippet) on optimizing Google's stock analytics snippet. Mathias also does an excellent job demystifying the the `_gaq` object. One last thing: check out [custom variables](http://code.google.com/apis/analytics/docs/tracking/gaTrackingCustomVariables.html). This feature is an excellent way to keep track of different categories of visitors. At Paperless Post, we use custom variables to help us understand the behavior of anonymous visitors versus logged in users.
