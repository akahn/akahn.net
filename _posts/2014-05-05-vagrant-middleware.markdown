---
title: How to Write a Vagrant Middleware
layout: blog
published: true
---

Recently at Paperless Post I've been working on upgrading our development environment to the latest version of Vagrant. We're migrating from 1.0.7 (released back in March 2013) to version 1.5.4 (released in April 2014). In the year between these two releases, a new plugin API was introduced and the API for writing middlewares changed dramatically. So if you have some code that looks like this:

{% highlight ruby %}
Vagrant.actions[:up].insert_before(Vagrant::Action::General::CheckVirtualbox,
                                   Middleware::SSHKeys)
{% endhighlight %}

You'll need to update it before being able to use a current version of Vagrant, first by turning it into a Vagrant plugin, and then by making it use Vagrant's current middleware API. One catch: this API isn't documented. Though Vagrant provides some [decent documentation for developing plugins](http://docs.vagrantup.com/v2/plugins/index.html), middlewares are left out. By <abbr title="Reading The Fine Source">RTFS</abbr> I was able to uncover the new middleware API.

## action_hook

The key to the new system is the method [`action_hook`](https://github.com/mitchellh/vagrant/blob/v1.5.4/lib/vagrant/plugin/v2/plugin.rb#L64-L77). To port the above code to the new system, it must be written like so:

{% highlight ruby %}
class SSHKeysPlugin < Vagrant.plugin('2')
  name "ssh_keys"

  action_hook(:copy_ssh_keys, :machine_action_up) do |hook|
    hook.before(VagrantPlugins::ProviderVirtualBox::Action::CheckVirtualbox, 
                Middleware::SSHKeys)
  end
end
{% endhighlight %}

Let's walk through this block of code:

1. As described in the plugin documentation, a plugin must be a class that inherits from `Vagrant.plugin('2')`.
2. You must `name` your plugin! [If you don't, your plugin won't be loaded](https://github.com/mitchellh/vagrant/blob/v1.5.4/lib/vagrant/plugin/v2/plugin.rb#L49-L50), and there will be no error message pointing out your mistake. Yes, I learned that the hard way.
3. Call `action_hook`. The first argument is an arbitrary name to call your action. The second is the event to attach your action to. You will likely want one of `machine_action_up`, `machine_action_provision`, or `machine_action_halt`. I haven't found an exhaustive list of events that can be hooked into, but by hacking [this code](https://github.com/mitchellh/vagrant/blob/v1.5.4/lib/vagrant/action/runner.rb#L40) to print the hooks as they happen, you can see what events are being called.
4. Insert a class (`Middleware::SSHKeys`, in this case) into the middleware stack by calling `hook.before`. There are [several ways](https://github.com/mitchellh/vagrant/blob/v1.5.4/lib/vagrant/action/hook.rb#L36-L66) to add your class to the stack. This class, as before, must implement `call`, which is passed the Vagrant environment. [Here's a simple example](https://github.com/mitchellh/vagrant/blob/v1.5.4/plugins/providers/virtualbox/action/boot.rb).
5. What was previously called `Vagrant::Action::General::CheckVirtualbox` is now called `VagrantPlugins::ProviderVirtualBox::Action::CheckVirtualbox`.

It's all very simple once you dig through the source code to figure out how it works. Hopefully this post makes it a little easier to get up and running with the Vagrant middleware system.
