---
title: Winning the lottery? An exploration of the MongoDB ObjectId
layout: blog
---

Time for a bug story. Recently at work I was asked to look at an error coming
from some old Ruby code that processes a CSV file as part of a billing job. The
error:

```
RangeError: bignum too big to convert into `long long'
```

Another engineer who was looking at the problem hadn't yet tracked down the
source of the problem (the script didn't print a backtrace), but noticed
something unusual: the error was associated with a user account whose MongoDB
identifier consisted of all numerical characters.  How can this happen? This
script has been running for 3 years, on accounts as old as 7 years, with this
never problem never occurring! MongoDB ObjectIds are 12-byte values with a
bunch of randomness built-in, how could one contain all numbers? What are the
odds of this happening? Should I (or this customer) go buy a lottery ticket?
Let's dig in to the probability of this happening.

## Hexadecimal encoding

Looking at a MongoDB ObjectId we can see that it consists of 24 characters whose possible values range from 0-9 and a-f. Here's
an example: `a07f1f77bcf86cd7994390a1`. This is because these 24 characters are actually 12 hexadecimal-encoded bytes.
In the above example, the hexadecimal a0 corresponds to decimal 161. The next pair, 7f, corresponds to 127. With
hexadecimal, it's possible to express any number from 0 to 255 (all the integers that can be stored in a byte, or 8
bits) in just two alphanumeric characters. That's pretty convenient, because it's more compact and easier to read.
Compare the above identifier with these other representations of the same ID:

* A series of integers decimal, separated by spaces: `160 127 31 119 188 248 108 215 153 67 144 161`
* Raw binary: `101000000111111100011111011101111011110011111000011011001101011110011001010000111001000010100001`

## Probability

Now that we know about hexadecimal we can start to answer our original
question: how likely is it for a MongoDB ObjectId to consist entirely of the
numerical hexadecimal values? Looking at all the bytes from 00 to FF we can see
that 90 out of 256 contain only numbers: 0–9, 10-19, 20-29, etc., all the way
through 90-99. Given there are 12 bytes in the ID, the probability is
`((90/256) ^ 12)` . That's roughly 0.000003565 or about 1 in 280,000—not so
rare after all.

## Looking closer at the MongoDB ObjectId

But as it turns out, not all 12 of those bytes are generated randomly. According
to [the docs](https://www.mongodb.com/docs/manual/reference/method/ObjectId/) a MongoDB ObjectId consists of:

* A Unix timestamp (4 bytes)
* A 5-byte random value generated once per process
* A 3-byte counter initialized to a random value

So the last 8 bytes are generated with some randomness, but the first 4 are a timestamp. This leads to a new
question: how common is it for a Unix timestamp (which is defined as number of seconds since January 1, 1970), when
hex-encoded, to contain only the 90 "numerical" hexadecimal values? I
wrote [a program](https://gist.github.com/akahn/46cfcdd2e82e8e5b3031f87562c7d8f2) to determine that, and here's the
output:

```
2022/12/03 13:08:21 Goroutine 0 reached the end (167009088). Found numerical hexes in 10000000/167009088 (0.059877) passes.
2022/12/03 13:08:21 Goroutine 1 reached the end (334018177). Found numerical hexes in 4000000/167009088 (0.023951) passes.
2022/12/03 13:08:21 Goroutine 2 reached the end (501027266). Found numerical hexes in 6000000/167009088 (0.035926) passes.
2022/12/03 13:08:21 Goroutine 3 reached the end (668036355). Found numerical hexes in 8000000/167009088 (0.047902) passes.
2022/12/03 13:08:21 Goroutine 4 reached the end (835045444). Found numerical hexes in 4000000/167009088 (0.023951) passes.
2022/12/03 13:08:21 Goroutine 5 reached the end (1002054533). Found numerical hexes in 8000000/167009088 (0.047902) passes.
2022/12/03 13:08:21 Goroutine 6 reached the end (1169063622). Found numerical hexes in 6000000/167009088 (0.035926) passes.
2022/12/03 13:08:21 Goroutine 7 reached the end (1336072711). Found numerical hexes in 4000000/167009088 (0.023951) passes.
2022/12/03 13:08:21 Goroutine 8 reached the end (1503081800). Found numerical hexes in 9973548/167009088 (0.059719) passes.
2022/12/03 13:08:21 Goroutine 9 reached the end (1670090889). Found numerical hexes in 3926451/167009088 (0.023510) passes.
2022/12/03 13:08:21 Total: 63899999/1670090896 (0.038261)
```

The occurrences vary based on the time range being scanned, but the overall result is about 3.8%. So, given that only 8
of our bytes are randomly generated, our new calculation is: `0.038261 * ((90/256) ^ 8)`, whose result
is 0.000008928. One in 112,000! (Stats/math/probability experts,
please [send me a correction](mailto:alexanderkahn@gmail.com) if I'm doing this wrong!)

Given the decent likelihood of this happening, how have we never hit this bug before in the millions of accounts that
have been created on Netlify? How is this only happening now? The answer is that this is billing code: it's only
concerned with accounts that paid (or at some point have paid) us money. As with any freemium SaaS product, this is a
tiny fraction of the overall number of accounts. So, what about all account IDs? How many of _them_ contain only
numerical account IDs? Let's ask our data warehouse:

``` sql
SELECT COUNT(*) FROM ACCOUNTS WHERE ACCOUNT_ID REGEXP '[0-9]{24}';
-- --> 131
```

This is actually more than I would expect. With our 3.7 million account records and a `0.000008928` chance of a
numerical
ID, I'd expect to find 330 such account IDs, and this is fairly close. What can explain this discrepancy? Part of the
answer is that probabilities predict likelihoods, but outcomes in the real world vary. In other words,
although a coin flip has a 50% chance of landing "heads", it's entirely possible to get 10 heads in a row. Additionally,
user behavior isn't randomly distributed. For example, they are more likely to create accounts on weekdays during waking
hours (and they're mostly concentrated in North America and Europe). And the timestamps that can be encoded as the
numerical hexadecimal values are not randomly distributed either. As we can see from the above Goroutine log output,
some time ranges have greater likelihood of containing these timestamps than others. In a future post, I plan to analyze
the data to delve into where in time these lucky numbers are concentrated and why.

## The bug

I wrote above that there would be a bug story, but I've just been blabbing about bytes and probability all this time. So
let's get into that bug in our code.

Ruby's CSV parsing library has a notion of `FieldConverter`s—bits of code that the parser uses to turn the strings of
text in CSV fields into Ruby object of the pertinent type. Converters can consist of a custom procedure, but there are
also some built-ins such as `:numeric`, which converts numerical fields to Ruby `Integer` or `Float` objects,
and `:date_time`, which converts values into `Time` objects. Additionally, and key to the surfacing of this bug, is the
fact that converters decide themselves whether or not they are pertinent depending on the look of the data found—if a
field looks like an integer, it will be converted to a Ruby `Integer`.

In our application, for many years, it was safe to assume that when the CSV parser encountered an account ID, it would
be converted to a Ruby `String`, because they always contained alphabetical characters, and could then be used to look
up a MongoDB record. That changed last month when an account with an all-numerical account ID became a paying customer.
Suddenly the code to look up the account by its ID began to throw the `RangeError` shown above, with the
seemingly [low-level C-sounding mention of `long long`](https://github.com/ruby/ruby/blob/v3_0_4/bignum.c#L5210). What's
happening here? When performing a Mongo operation, the data is converted to BSON before being sent to the database.
Under the hood, this is implemented in C. When a Ruby Integer is encountered, the BSON library attempts to write it
into,
buffer. But if the number can't be converted into a `long long` (with the `NUM2LL` function), `RangeError` is thrown (
see
[init.c for some explanation](https://github.com/mongodb/bson-ruby/blob/53cad639e03c63891d8ff945ae1fbc77b4fcb633/ext/bson/init.c#L246-L256)).

``` ruby
# 32-bit integer fits fine
pry(main) > Account.find(2 ** 63 - 1)
nil

# 64-bit integer is too big
pry(main) > Account.find(2 ** 63)
RangeError : bignum too big to convert into `long long'

# if that same integer is represented as a string, however, no problem
pry(main)> Account.find((2**63).to_s)
nil
```

How can we fix this? A simple fix is to convert all object IDs to strings before the MongoDB operations with `to_s`. A
more orderly approach would be to set up a field converter for each column in the document. An undocumented
feature of Ruby's FieldConverters is that the second argument passed to the proc is a `FieldInfo` object that contains
the name of the header. In this way, it's possible to set up a field converter that operates on a specific column only.
An example of this would look like:

``` ruby
csv = "account_id,site_count,page_count\n111111111111111111111111,3,100"
by_column = lambda do |value, field_info|
    case field_info.header
    when "site_count", "page_count"
        Integer(value)
    else
        value
    end
end
CSV.parse(csv, headers: true, converters: [by_column]).to_a
[
    [0] [
        [0] "account_id",
        [1] "site_count",
        [2] "page_count"
    ],
    [1] [
        [0] "111111111111111111111111",
        [1] 3,
        [2] 100
    ]
```

In the above code, the `site_count` and `page_count` fields are converted to
integers, but `account_id` is left as a string, even though it "looks like a
number".

## Conclusion


* Assumptions are safe to make, until they aren't any more
* If you're printing a Ruby exception, print the backtrace too
* But that backtrace may not point to the _actual_ C code underlying a Ruby API
* Something that seems rare may not actually be rare, if there is sampling bias

Thank you for reading this long-winded . In a way this has been an exercise in numerology -- looking for meaning in
numbers where there isn't any. But at the same time it has been a useful exercise in thinking about how computers work.
Despite 12+ years working in the industry, some of these concepts (like, how does a computer work?) are relatively new
for me.
