---
title: Working Through Git Conflicts in Vim
layout: blog
published: true
---

In this post I present a workflow I use to help me efficiently go through Git merge conflicts and correct them. It eliminates some of the typing and tedium involved in this process.

It starts with a shell alias, `conflicts`. The alias is defined as:

{% highlight bash %}
alias conflicts="git ls-files --unmerged | cut -f2 | uniq"
{% endhighlight %}

In Git, `unmerged` means a file that couldn't be merged because of a conflict. So this Git command lists all of the objects containing conflicts. I pipe that command's output to `cut -f2` to get the second column of its output, the filenames. I then remove repeat entries using `uniq`, since this `ls-files` command outputs multiple objects for each conflict.

When I want to start resolving conflicts, I issue the command `conflicts | xargs mvim`. `xargs` is a powerful tool that takes its standard input – in this case, a list of files – and and provides that to a command as arguments. So, MacVim receives the list of conflicting files as arguments and loads the files into its buffer list.

I then fix the first conflict. If I'm dealing with a particularly long file, I use `/` to search for `<<<<` or other such conflict markers that Git places in the file.

When I'm done fixing the conflict, I execute `:Git add %` to add the file to the Git index. [fugitive.vim](https://github.com/tpope/vim-fugitive), Time Pope's essential Git intergation tool for Vim, provides the `:Git` command which passes through your command to the `git` command line. On the Vim command line `%` refers to the current file.[^1]

Having fixed a conflict and added a file to the Git index, I'm ready to deal with the next conflict. To get to the next conflicted file I use `:bdelete`, or `:bd` for short. Since we started Vim with a series of files as command line arguments, the buffer list is loaded with all the files we need to edit. `:bdelete` discards the current one and loads the next one. I repeat this process until there are no buffers left.

Once there are no remaining conflicts, I close my Vim window, go back to a terminal, and complete the merge using `gc`. What is `gc`? It's an alias for `git commit --verbose`. Verbose commit output is awesome because it shows exactly what you're about to commit. It saves me the step of doing `git diff` before each commit. I never want to commit without `--verbose`.

And that's it. If this tended to be a long process or one I undertook more often, I could automate it further by creating a Vim command that combines the `git add` and `:bdelete` steps. As it stands, this workflow eliminates typing out long filenames and introduces a pleasant rhythm to this process. I hope this post has inspired you to script the tedious workflows in your Unix life. What tedious operations would you like to automate away?

[^1]: `%` is a great feature that I recommend [reading up on](http://vimdoc.sourceforge.net/htmldoc/cmdline.html#cmdline-special). Also check out the bash-like [filename modifiers](http://vimdoc.sourceforge.net/htmldoc/cmdline.html#filename-modifiers) that you can use with `%`. Most often, I use the "head" modifier, `:h`, to change to the directory of the current file: `:cd %:h`. Or, if I'm editing a new file in a directory that doesn't exist yet, I can create the directory: `:!mkdir -p %:h`.
