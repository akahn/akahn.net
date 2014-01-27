---
title: Fast Postgres Seed Data Imports Using TEMPLATE
layout: blog
published: true
---

In this post I describe an unconventional use of PostgreSQL's [template database feature](http://www.postgresql.org/docs/current/static/manage-ag-templatedbs.html) that streamlines a development process at Paperless Post. Every night, a script generates a SQL dump containing the seed data[^1] that developers or QA engineers need in order to use the site in non-production environments. The dump is based on production data, but strips out user-created content and sanitizes email addresses to reduce the chance of a developer accidentally sending an errant email to a customer.

Using a command-line tool, Paperless engineers can request to refresh an environment of their choice with the nightly seed data. At one time, this command took about twenty minutes to complete, as the process downloaded the staging dump and loaded the data into the database server.

I optimized this process by modifying the nightly script to not only generate a SQL dump, but also to load that dump into the database server as a standby database. Then, when an engineer wants to import fresh data, rather than importing a SQL dump, the command does the following: `CREATE DATABASE staging_database TEMPLATE staging_database_standby;`.  This statement creates a new database based on the standby database, which contains all the necessary seed data. The slow part of the process, importing the database, has been done in advance, overnight, when the standby database was created. Creating the new database based on the standby takes just a few seconds. Once the application is running, the engineers can continue their work, fresh data in place. 

If you import data into Postgres routinely, perhaps the process can be streamlined with this technique. Questions for readers: How could this process be improved? How does your team automate the seed data process?

[^1]: Shout out to Vanessa Hurst, who implemented the system that creates the seed data, which is worthy of its own post.
