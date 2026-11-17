let SessionLoad = 1
let s:so_save = &g:so | let s:siso_save = &g:siso | setg so=0 siso=0 | setl so=-1 siso=-1
let v:this_session=expand("<sfile>:p")
silent only
silent tabonly
cd ~/Projects/learning/river_lsp/server
if expand('%') == '' && !&modified && line('$') <= 1 && getline(1) == ''
  let s:wipebuf = bufnr('%')
endif
let s:shortmess_save = &shortmess
set shortmess+=aoO
badd +4 ~/.config/nvim/lua/functions/alloy_visualizer.lua
badd +148 ~/Projects/alloy_test/config-nginx.alloy
argglobal
%argdel
edit ~/Projects/alloy_test/config-nginx.alloy
wincmd t
let s:save_winminheight = &winminheight
let s:save_winminwidth = &winminwidth
set winminheight=0
set winheight=1
set winminwidth=0
set winwidth=1
argglobal
balt ~/.config/nvim/lua/functions/alloy_visualizer.lua
setlocal foldmethod=manual
setlocal foldexpr=v:lua.require'lazyvim.util'.ui.foldexpr()
setlocal foldmarker={{{,}}}
setlocal foldignore=#
setlocal foldlevel=99
setlocal foldminlines=1
setlocal foldnestmax=6
setlocal foldenable
silent! normal! zE
sil! 1,4fold
sil! 6,11fold
sil! 13,18fold
sil! 21,23fold
sil! 25,28fold
sil! 31,39fold
sil! 30,40fold
sil! 20,43fold
sil! 46,52fold
sil! 54,60fold
sil! 62,68fold
sil! 70,76fold
sil! 78,84fold
sil! 86,92fold
sil! 94,100fold
sil! 45,103fold
sil! 106,108fold
sil! 111,116fold
sil! 110,117fold
sil! 120,125fold
sil! 119,126fold
sil! 129,134fold
sil! 128,135fold
sil! 138,142fold
sil! 137,143fold
sil! 105,146fold
sil! 149,151fold
sil! 152,157fold
sil! 148,158fold
sil! 162,168fold
sil! 161,169fold
sil! 160,174fold
sil! 177,179fold
sil! 176,180fold
let &fdl = &fdl
let s:l = 148 - ((23 * winheight(0) + 23) / 47)
if s:l < 1 | let s:l = 1 | endif
keepjumps exe s:l
normal! zt
keepjumps 148
normal! 0
tabnext 1
if exists('s:wipebuf') && len(win_findbuf(s:wipebuf)) == 0 && getbufvar(s:wipebuf, '&buftype') isnot# 'terminal'
  silent exe 'bwipe ' . s:wipebuf
endif
unlet! s:wipebuf
set winheight=1 winwidth=20
let &shortmess = s:shortmess_save
let &winminheight = s:save_winminheight
let &winminwidth = s:save_winminwidth
let s:sx = expand("<sfile>:p:r")."x.vim"
if filereadable(s:sx)
  exe "source " . fnameescape(s:sx)
endif
let &g:so = s:so_save | let &g:siso = s:siso_save
set hlsearch
doautoall SessionLoadPost
unlet SessionLoad
" vim: set ft=vim :
