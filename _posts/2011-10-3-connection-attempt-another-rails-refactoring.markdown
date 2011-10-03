---
title: "ConnectionAttempt: Another Rails Refactoring"
layout: blog
published: true
---

In the last few months I've been learning a lot about object-oriented design. By following the conversations and writings of Avdi Grimm, Corey Haines, Steve Klabnik, Gary Bernhardt and others (even going way back to [James Golick](http://jamesgolick.com/2010/3/14/crazy-heretical-and-awesome-the-way-i-write-rails-apps.html)), I've been able to identify some design issues in the codebase I work on every day at Paperless Post. These are issues that I had sensed previously, but had lacked a vocabulary with which to discuss them. In this post I consider a refactoring I undertook recently in our codebase. Through this discussion, I hope to help spread the good word on design in Rails applications.

The code I'm working with here is for Paperless Post's integration with Eventbrite. Recently, we launched a feature that allows users to connect their account with an Eventbrite account. This allows users to link invitations on our site with ticketed events on Eventbrite. As a new requirement emerged, my original implementation became inadequate.

### The Old Code

The following controller is responsible for connecting a user's account with their account on Eventbrite:

{% highlight ruby %}
class EventbriteAccountConnectionsController < ApplicationController
  def create
    if connection = EventbriteAccountConnection.connect(
        :account_id => current_account.id,
        :email => params[:email],
        :password => params[:password]
      )
      client_messenger.add_notice "Successfully logged in to Eventbrite."
      client_messenger[:connection_id] = connection.id
    else
      client_messenger.add_error "Sorry, we were unable to log you in to Eventbrite."
    end
    send_messages
  end
end
{% endhighlight %}

There are two details to note here. One is that `client_messenger` and `send_messages` are methods that deal with a `ClientMessenger`, an object for preparing and sending JSON responses to the client. I'll use this again later on. The other detail is that when connecting accounts is successful, the client needs the ID of the connection record, so the controller must include this data in the response.

This is the model code that is called by the controller:

{% highlight ruby %}
class EventbriteAccountConnection < ActiveRecord::Base
  def self.connect(credentials)
    resp = EventbriteClient.user_get(credentials[:email], credentials[:password])
    return if resp['error']
    self.create(
      :account_id => credentials[:account_id],
      :code => resp['user']['user_key']),
      :remote_id => resp['user']['user_id']
    )
  end
end
{% endhighlight %}

This code attempts to fetch a user from Eventbrite's API and, if successful, creates and returns a connection record. If the API request responds with an error, the method returns `nil`. This code worked reliably, but eventually our team wanted to convey error messages from Eventbrite to users rather than just indicating success or failure. This way we would be able to distinguish between a failure with the user's Eventbrite account, or a mistake on our site.

The most immediate solution to this problem would have been to modify the model method to return a more descriptive response in the case of failure. Then the controller could receive the error message and pass it along to users. This means that in case of success, the method would return an `EventbriteAccountConnection` whereas in failure it would return a `String`. Maybe it's the Haskell talking, but I tend to think of wildly differing return types as a code smell. If the types respond to the same messages, it's all good: duck-typing should be embraced in our code. But in this case there would be little recourse other than to check the type of the response: if the controller gets back a `String`, there was an error; if it gets an `EventbriteAccountConnection`, success. Ick.

A better option would be to for `EventbriteAccountConnection.connect` to return a `Struct` subclass that has a slot for an error message and a slot for an `EventbriteAccountConnection` instance. If the connection instance is present, that indicates success. If it's missing, the login failed, and we should display the struct's error attribute.

This could be a workable solution, but it sidesteps some fundamental design problems in `EventbriteAccountConnection.connect`. The most obvious issue to me was that it is a class method. I don't think, [as some do](http://andrzejonsoftware.blogspot.com/2011/07/yes-nick-class-methods-are-evil.html), that class methods are evil. However, they can indicate an attempt to use a class as a "bucket of methods," ignoring or avoiding the advantages of encapsulating data and behavior in an object. In this case, I defined this as a class method because I could sense that the ActiveRecord model couldn't provide the encapsulation I needed. But at the time, I didn't take the further step of defining a *new* class to abstract out the connection logic.

### The New Code

Given the additional requirement of improved error propagation, I took the opportunity to extract this account connection logic into a new domain object. Here is the code I arrived at, with some details omitted:

{% highlight ruby %}
class EventbriteAccountConnection::ConnectionAttempt
  def initialize(account, email_address, password)
    @account = account
    @response = EventbriteClient.user_get(email_address, password)
    @connection = save_connection
  end

  def as_messenger(messenger = ClientMessenger.new)
    if success?
      messenger << "Successfully logged in to Eventbrite."
      messenger[:connection_id] = @connection.id
    else
      messenger.add_error(error_message)
    end

    messenger
  end
end
{% endhighlight %}

This my not be the greatest Ruby class ever, but it's a significant improvement in design. To use the terminology of Hal Abelson and Gerald Sussman in *Structure and Interpretation of Computer Programs*, I have created a data abstraction, binding together an account and some login information into a bundle that has some meaning. By introducing the name `ConnectionAttempt` I have brought to the surface – I have reified – a concept that was previously submerged. This will aid future readers and maintainers of this code. After all, the goal of code is not just to provide instructions for the computer to carry out – it is also to communicate meaning to other humans. In this sense, this refactoring is a success.

The new service object also yields a simpler controller:

{% highlight ruby %}
class EventbriteAccountConnectionsController < ApplicationController
  def create
    render :json => EventbriteAccountConnection::ConnectionAttempt.new(
      current_account, params[:email], params[:password]).as_messenger
  end
end
{% endhighlight %}

This is my ideal controller: it contains no logic. It merely calls out to a collaborator, passing it some parameters, and returns a response. While, in many cases, building a response directly in the controller is appropriate, in this case, given the non-trivial logic for generating the response, I've made this the responsibility of `ConnectionAttempt`. This prevents the controller from having to reach into its collaborator to query its internal state. It tells the object what it wants rather than asking.

The entirety of the ActiveRecord model is now:

{% highlight ruby %}
class EventbriteAccountConnection < ActiveRecord::Base
end
{% endhighlight %}

This svelte class now respects the Single Responsibility Principle. Its sole purpose is to persist account connections to the database.

Because `ConnectionAttempt` has a narrow interface to `EventbriteAccountConnection`, it's easy to mock out this external dependency. This makes the tests faster since it eliminates the need to persist ActiveRecord objects to the database. It also allows running the test without loading the entire Rails application. But there's an additional, more subtle advantage to this use of mocking. By isolating `ConnectionAttempt` from the `EventbriteAccountConnection` that it ultimately attempts to create, the test becomes clearer because it takes advantage the abstraction barrier between the two domain concepts, allowing the test to focus more strictly on the object under test.

### Discussion

It's a bit silly how revelatory this feels to me. Object-oriented design has never been kept a secret, yet it seems this knowledge has been forgotten in the context of Rails applications. At the same time, to some to some, this design knowledge has been a given for years. In my case, although I read James Golick's post on the topic almost two years ago, when I was starting to use Ruby and Rails, I didn't piece it all together until recently. Now I know that by paying attention to design, we can build more maintainable, more understandable Rails apps, with faster test suites.

I'd like to hear from you. What do you think of this code? How would you continue this refactoring? What design strategies have you applied in your Rails apps, and what lessons have you learned?
