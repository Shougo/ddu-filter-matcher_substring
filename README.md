# ddu-filter-matcher_substring

Substring matcher for ddu.vim

This matcher filters substring matched items.

## Required

### denops.vim

https://github.com/vim-denops/denops.vim

### ddu.vim

https://github.com/Shougo/ddu.vim

## Configuration

```vim
call ddu#custom#patch_global(#{
    \   sourceOptions: #{
    \     _: #{
    \       matchers: ['matcher_substring'],
    \     },
    \   }
    \ })

" Enable highlight matched text
" Note: It is slow
call ddu#custom#patch_global(#{
    \   filterParams: #{
    \     matcher_substring: #{
    \       highlightMatched: 'PmenuMatch',
    \     },
    \   }
    \ })
```
