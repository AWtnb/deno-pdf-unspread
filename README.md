# README

Using [pdf-lib](https://github.com/Hopding/pdf-lib) on [Deno](https://deno.com/).

## Build

```
deno compile --allow-import --allow-read --allow-write --output unspread .\main.ts
```




## Usage

Original:

![img](images/img-0_base.png)

### horizontal unspread

```
.\pdfunspread.exe --path path\to\file.pdf
```

![img](images/img-1.png)


### horizontal unspread (right to left)

```
.\pdfunspread.exe --path path\to\file.pdf --opposite
```

![img](images/img-2_opposite.png)

### vertical unspread

```
.\pdfunspread.exe --path path\to\file.pdf --vertical
```

![img](images/img-3_vertical.png)


### vertical unspread (down to up)

```
.\pdfunspread.exe --path path\to\file.pdf --vertical --opposite
```


![img](images/img-4_vertical_opposite.png)


### horizontal unspread (centerize first page)

```
.\pdfunspread.exe --path path\to\file.pdf --centeredTop
```

![img](images/img-5_centeredTop.png)


### vertical unspread (centerize first page)

```
.\pdfunspread.exe --path path\to\file.pdf --centeredTop --vertical
```


![img](images/img-6_centeredTop_vertical.png)



