# Typescript Parsing

## How to use this?
- Run `npm install all`
- Run `ts-node -p package.json parseRepo.ts {name_of_your_file.ts} {directory_location} {name_of_your_file.ts}`

### Why do I need to repeat the file name 2 times?
We had a use-case where files could be moved between commits, to work around that
issue we provide the name of the file twice if you change that, your symbols will be
relative to the file which you mention here

## What can I expect to get after running this?

Say you have 2 files:
```
alpha.ts
beta.ts
```

and the contents of `alpha.ts` is:
```
import B from 'beta'
export interface A {
    b: B
}
```

and the contents of `beta.ts` is:
```
export interface B {
    test: string
}
```

you should be able to see the symbols as:
```
`alpha.A` and `beta.B` and that `alpha.A` depends on `beta.B` 
```
