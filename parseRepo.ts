// We will put all the code here to parse a single file, so we can call to it
// anytime

import { ArrowFunction, Block, FunctionDeclaration, MethodDeclaration, Project, SourceFile, SyntaxKind } from "ts-morph";


import * as path from "path";
import * as fs from 'fs';

export const getCodeLocationPath = (
    directoryPath: string,
    filePath: string,
): string => {
    // Parse the filePath to get an object that includes properties like root, dir, base, ext and name
    const parsedFilePath = path.parse(filePath);

    // Remove the extension of the file
    const filePathWithoutExt = path.join(parsedFilePath.dir, parsedFilePath.name);

    // Find the relative path from directoryPath to filePathWithoutExt
    const relativePath = path.relative(directoryPath, filePathWithoutExt);

    // Replace backslashes with forward slashes to make it work consistently across different platforms (Windows uses backslashes)
    return relativePath.replace(/\//g, '.');
};


// Declare an enum here going to a string type with typescript.function
// typescript.class etc
export enum TypescriptCodeType {
    typescriptFunction = "typescript.function",
    typescriptClass = "typescript.class",
    typescriptInterface = "typescript.interface",
    typescriptClassMethod = "typescript.classMethod",
    typescriptClassArrowFunction = "typescript.classArrowFunction",
    typescriptArrowFunction = "typescript.arrowFunction",
    typescriptTypeAlias = "typescript.typeAlias",
}

export function getTitleForCodeType(
    codeType: string | null,
): string {
    switch (codeType) {
        case TypescriptCodeType.typescriptFunction:
            return "Function";
        case TypescriptCodeType.typescriptClass:
            return "Class";
        case TypescriptCodeType.typescriptInterface:
            return "Interface";
        case TypescriptCodeType.typescriptClassMethod:
            return "Class Method";
        case TypescriptCodeType.typescriptClassArrowFunction:
            return "Class Arrow Function";
        case TypescriptCodeType.typescriptArrowFunction:
            return "Arrow Function";
        case TypescriptCodeType.typescriptTypeAlias:
            return "Type Alias";
        default:
            return "Unknown";
    }
}

// This is a direct copy of SymbolKind, we are using it to keep things free
// of vscode dependencies
export enum CodeSymbolKind {
    file = 0,
    module = 1,
    namespace = 2,
    package = 3,
    class = 4,
    method = 5,
    property = 6,
    field = 7,
    constructor = 8,
    enum = 9,
    interface = 10,
    function = 11,
    variable = 12,
    constant = 13,
    string = 14,
    number = 15,
    boolean = 16,
    array = 17,
    object = 18,
    key = 19,
    null = 20,
    enumMember = 21,
    struct = 22,
    event = 23,
    operator = 24,
    typeParameter = 25
}

export interface CodeSymbolInformation {
    symbolName: string,
    symbolKind: CodeSymbolKind,
    symbolStartLine: number,
    symbolEndLine: number,
    codeSnippet:
    { languageId: string; code: string },
    extraSymbolHint: string | null,
    dependencies: CodeSymbolDependencies[],
    fsFilePath: string,
    originalFilePath: string,
    workingDirectory: string,
    displayName: string,
    originalName: string,
    originalSymbolName: string,
}

export interface FileCodeSymbolInformation {
    workingDirectory: string,
    filePath: string,
    codeSymbols: CodeSymbolInformation[],
}


export interface CodeSymbolDependencies {
    codeSymbolName: string,
    codeSymbolKind: CodeSymbolKind,
    // The edges here are to the code symbol node in our graph
    edges: CodeSymbolDependencyWithFileInformation[],
}

export interface CodeSymbolDependencyWithFileInformation {
    codeSymbolName: string,
    filePath: string,
}


// Arrow functions are not handled yet, once we have that we can start indexing
// we already have some react code along with typescript code thrown in
// so we can use both to understand more completely whats happening
function parseFunctionNode(
    functionNode: FunctionDeclaration,
    moduleName: string,
    directoryPathString: string,
    project: Project,
    sourceFile: SourceFile,
    originalFilePath: string,
): CodeSymbolInformation | null {
    const currentFunction = functionNode;
    const functionName = currentFunction.getName();
    console.log(`[ts-morph][parseFunctionNode] We found function with name: ${functionName}`);
    if (functionName) {
        currentFunction.getStartLineNumber();
        currentFunction.getEndLineNumber();
        const codeSymbolInformation: CodeSymbolInformation = {
            symbolName: moduleName + "." + functionName,
            symbolKind: CodeSymbolKind.function,
            symbolStartLine: currentFunction.getStartLineNumber(),
            symbolEndLine: currentFunction.getEndLineNumber(),
            codeSnippet: {
                languageId: "typescript",
                code: functionNode.getBody()?.getText() || "",
            },
            extraSymbolHint: TypescriptCodeType.typescriptFunction,
            dependencies: currentFunction.getChildrenOfKind(SyntaxKind.Block)
                .map((block) => parseCodeBlockForDependencies(
                    block,
                    functionName,
                    moduleName,
                    directoryPathString,
                    project,
                    sourceFile,
                ))
                .reduce((acc, val) => acc.concat(val), []),
            fsFilePath: currentFunction.getSourceFile().getFilePath(),
            originalFilePath,
            workingDirectory: directoryPathString,
            displayName: `${functionName}()`,
            originalName: functionName,
            originalSymbolName: functionName,
        };
        return codeSymbolInformation;
    }
    return null;
}

// We are doing a quick check if this nodes belongs to another function,
// this is a dirty way to prevent many extra nodes and subfunctions from being
// recognized which is fine for now
function checkIfParentIsAFunction(
    arrowFunction: ArrowFunction,
): boolean {
    const arrowParent = arrowFunction.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
    const functionParent = arrowFunction.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
    if (arrowParent || functionParent) {
        return true;
    } else {
        return false;
    }
}

function parseArrowFunctionNode(
    arrowFunction: ArrowFunction,
    className: string | null,
    moduleName: string,
    directoryPathString: string,
    project: Project,
    sourceFile: SourceFile,
    originalFilePath: string,
): CodeSymbolInformation | null {
    const currentArrowExpression = arrowFunction;
    const parent = currentArrowExpression.getParent();
    if (checkIfParentIsAFunction(currentArrowExpression)) {
        return null;
    }
    if (parent) {
        const name = parent.getChildrenOfKind(SyntaxKind.Identifier);
        if (name.length > 0) {
            let symbolName = "";
            let extraSymbolHint = "";
            if (className !== null) {
                symbolName = moduleName + "." + className + "." + name[0].getText();
                extraSymbolHint = TypescriptCodeType.typescriptClassArrowFunction;
            } else {
                symbolName = moduleName + "." + name[0].getText();
                extraSymbolHint = TypescriptCodeType.typescriptArrowFunction;
            }
            console.log(`[ts-morph][parseArrowFunctionNode] We found arrow function with name: ${symbolName}`);
            const codeSymbolInformation = {
                symbolName: symbolName,
                symbolKind: CodeSymbolKind.function,
                symbolStartLine: currentArrowExpression.getStartLineNumber(),
                symbolEndLine: currentArrowExpression.getEndLineNumber(),
                codeSnippet: {
                    languageId: "typescript",
                    code: arrowFunction.getBody()?.getText() || "",
                },
                extraSymbolHint,
                dependencies: currentArrowExpression.getChildrenOfKind(SyntaxKind.Block)
                    .map((block) => parseCodeBlockForDependencies(
                        block,
                        symbolName,
                        moduleName,
                        directoryPathString,
                        project,
                        sourceFile,
                    ))
                    .reduce((acc, val) => acc.concat(val), []),
                fsFilePath: currentArrowExpression.getSourceFile().getFilePath(),
                originalFilePath: originalFilePath,
                workingDirectory: directoryPathString,
                displayName: `${name[0].getText()} callback()`,
                originalName: name[0].getText(),
                originalSymbolName: name[0].getText(),
            };
            return codeSymbolInformation;
        }
    }
    return null;
}

function parseMethodDeclaration(
    className: string,
    methodDeclaration: MethodDeclaration,
    moduleName: string,
    directoryPathString: string,
    project: Project,
    sourceFile: SourceFile,
    originalFilePath: string,
): CodeSymbolInformation | null {
    const methodName = methodDeclaration.getName();
    if (methodName) {
        methodDeclaration.getStartLineNumber();
        methodDeclaration.getEndLineNumber();
        const codeSymbolInformation = {
            symbolName: moduleName + "." + className + "." + methodName,
            symbolKind: CodeSymbolKind.method,
            symbolStartLine: methodDeclaration.getStartLineNumber(),
            symbolEndLine: methodDeclaration.getEndLineNumber(),
            codeSnippet: {
                languageId: "typescript",
                code: methodDeclaration.getBody()?.getText() || "",
            },
            dependencies: methodDeclaration.getChildrenOfKind(SyntaxKind.Block)
                .map((block) => parseCodeBlockForDependencies(
                    block,
                    methodName,
                    moduleName,
                    directoryPathString,
                    project,
                    sourceFile,
                ))
                .reduce((acc, val) => acc.concat(val), []),
            extraSymbolHint: TypescriptCodeType.typescriptClassMethod,
            fsFilePath: methodDeclaration.getSourceFile().getFilePath(),
            originalFilePath,
            workingDirectory: directoryPathString,
            displayName: `${methodName}()`,
            originalName: methodName,
            originalSymbolName: methodName,
        };
        return codeSymbolInformation;
    }
    return null;
}


function getClassSymbolFromFile(
    sourceFile: SourceFile,
    directoryPath: string,
    project: Project,
    originalFilePath: string,
): CodeSymbolInformation[] {
    const classes = sourceFile.getClasses();
    const moduleName = getCodeLocationPath(
        directoryPath,
        sourceFile.getFilePath(),
    );
    const codeSymbolInformationList: CodeSymbolInformation[] = [];
    for (let index = 0; index < classes.length; index++) {
        const currentClass = classes[index];
        const className = currentClass.getName();
        if (className) {
            currentClass.getStartLineNumber();
            currentClass.getEndLineNumber();
            const classCodeSymbolInformation: CodeSymbolInformation = {
                symbolName: moduleName + "." + className,
                symbolKind: CodeSymbolKind.class,
                symbolStartLine: currentClass.getStartLineNumber(),
                symbolEndLine: currentClass.getEndLineNumber(),
                codeSnippet: {
                    languageId: "typescript",
                    code: "",
                },
                extraSymbolHint: TypescriptCodeType.typescriptClass,
                dependencies: [],
                fsFilePath: sourceFile.getFilePath(),
                originalFilePath,
                workingDirectory: directoryPath,
                displayName: `class ${className}`,
                originalName: className,
                originalSymbolName: className,
            };

            const functions = currentClass.getMethods();
            const functionCodeSymbols = [];
            for (let index2 = 0; index2 < functions.length; index2++) {
                const currentFunction = functions[index2];
                const functionCodeSymbol = parseMethodDeclaration(
                    className,
                    currentFunction,
                    moduleName,
                    directoryPath,
                    project,
                    sourceFile,
                    originalFilePath,
                );
                if (functionCodeSymbol !== null) {
                    functionCodeSymbols.push(functionCodeSymbol);
                    codeSymbolInformationList.push(functionCodeSymbol);
                }
            }
            classCodeSymbolInformation.dependencies = functionCodeSymbols.map((functionCodeSymbol) => {
                return {
                    codeSymbolName: moduleName + "." + className,
                    codeSymbolKind: CodeSymbolKind.function,
                    edges: [{
                        codeSymbolName: functionCodeSymbol.symbolName,
                        filePath: sourceFile.getFilePath(),
                    }],
                };
            });
            codeSymbolInformationList.push(classCodeSymbolInformation);
        }
    }
    return codeSymbolInformationList;
}

function getInterfaceSymbolFromFile(
    sourceFile: SourceFile,
    directoryPath: string,
    project: Project,
    originalFilePath: string,
): CodeSymbolInformation[] {
    const moduleName = getCodeLocationPath(
        directoryPath,
        sourceFile.getFilePath(),
    );
    // console.log("[ts-morph] Module name found: " + moduleName);
    const codeSymbolInformationList: CodeSymbolInformation[] = [];

    const interfaces = sourceFile.getInterfaces();
    for (let index = 0; index < interfaces.length; index++) {
        const currentInterface = interfaces[index];
        const interfaceName = currentInterface.getName();
        if (interfaceName) {
            currentInterface.getStartLineNumber();
            currentInterface.getEndLineNumber();
            const codeSymbolInformation = {
                symbolName: moduleName + "." + interfaceName,
                symbolKind: CodeSymbolKind.interface,
                symbolStartLine: currentInterface.getStartLineNumber(),
                symbolEndLine: currentInterface.getEndLineNumber(),
                codeSnippet: {
                    languageId: "typescript",
                    code: currentInterface.getText() || "",
                },
                extraSymbolHint: TypescriptCodeType.typescriptInterface,
                dependencies: currentInterface.getChildrenOfKind(SyntaxKind.Block)
                    .map((block) => parseCodeBlockForDependencies(
                        block,
                        interfaceName,
                        moduleName,
                        directoryPath,
                        project,
                        sourceFile,
                    ))
                    .reduce((acc, val) => acc.concat(val), []),
                fsFilePath: currentInterface.getSourceFile().getFilePath(),
                originalFilePath,
                workingDirectory: directoryPath,
                displayName: `interface ${interfaceName}`,
                originalName: interfaceName,
                originalSymbolName: interfaceName,
            };
            codeSymbolInformationList.push(codeSymbolInformation);
        }
    }
    return codeSymbolInformationList;
}


function getTypeAliasFromFile(
    sourceFile: SourceFile,
    directoryPath: string,
    project: Project,
    originalFilePath: string,
): CodeSymbolInformation[] {
    const moduleName = getCodeLocationPath(
        directoryPath,
        sourceFile.getFilePath(),
    );
    // console.log("[ts-morph] Module name found: " + moduleName);
    const codeSymbolInformationList: CodeSymbolInformation[] = [];

    const typeAliases = sourceFile.getTypeAliases();
    for (let index = 0; index < typeAliases.length; index++) {
        const currentTypeAlias = typeAliases[index];
        const typeAliasName = currentTypeAlias.getName();
        if (typeAliasName) {
            currentTypeAlias.getStartLineNumber();
            currentTypeAlias.getEndLineNumber();
            const codeSymbolInformation = {
                symbolName: moduleName + "." + typeAliasName,
                symbolKind: CodeSymbolKind.typeParameter,
                symbolStartLine: currentTypeAlias.getStartLineNumber(),
                symbolEndLine: currentTypeAlias.getEndLineNumber(),
                codeSnippet: {
                    languageId: "typescript",
                    code: currentTypeAlias.getText() || "",
                },
                extraSymbolHint: TypescriptCodeType.typescriptTypeAlias,
                dependencies: currentTypeAlias.getChildrenOfKind(SyntaxKind.Block)
                    .map((block) => parseCodeBlockForDependencies(
                        block,
                        typeAliasName,
                        moduleName,
                        directoryPath,
                        project,
                        sourceFile,
                    ))
                    .reduce((acc, val) => acc.concat(val), []),
                fsFilePath: currentTypeAlias.getSourceFile().getFilePath(),
                originalFilePath,
                workingDirectory: directoryPath,
                displayName: `type ${typeAliasName}`,
                originalName: typeAliasName,
                originalSymbolName: typeAliasName,
            };
            codeSymbolInformationList.push(codeSymbolInformation);
        }
    }
    return codeSymbolInformationList;
}

// Case this covers:
// export const revisit = createCookie("revisit", {
//   maxAge: 24 * 60 * 60, // one week
// });
// https://ts-ast-viewer.com/#code/JYWwDg9gTgLgBAbzgYygUwIYzQYQhAa2DTgF84AzKCEOAIgAF0RgAPAWigFcA7Aeh4QAJmjoBuAFAS0rSLBQQeAZ3joAbsCXB4AXhTosufETQAKOus3a6AGkQS4cEBlYBBAOZoAXHABMAFjgAKjgANgAGYLDwuz4+OEUSAHc0NAIJUgBKSSkZOXhkRRU4JRo0GAALYB53OD1TDB8VKGr3TLqAPntHQuUIABs0ADp+iHcG7McMsSA
// its a function invocation assigned to a global variable
// We literally check if its a variable declaration and then try to see if
// internally it has a child like: CallExpression
// using that we are able to get the variable declaration
function getVariableDeclarationFunctionFromFile(
    sourceFile: SourceFile,
    directoryPath: string,
    project: Project,
    originalFilePath: string,
): CodeSymbolInformation[] {
    const moduleName = getCodeLocationPath(
        directoryPath,
        sourceFile.getFilePath(),
    );
    // console.log("[ts-morph] Module name found: " + moduleName);
    const codeSymbolInformationList: CodeSymbolInformation[] = [];

    const variableDeclarations = sourceFile.getVariableDeclarations();
    for (let index = 0; index < variableDeclarations.length; index++) {
        const currentVariableDeclaration = variableDeclarations[index];
        // If there is one child of this type then we are okay
        const callExpressionChildren = currentVariableDeclaration.getDescendantsOfKind(
            SyntaxKind.CallExpression,
        );
        // Check if one of the immediate child is of type Arrow Expression, if
        // thats the case, then its mostly covered by the arrow expression parsing
        // check before
        const arrowDeclarationChild = currentVariableDeclaration.getChildrenOfKind(
            SyntaxKind.ArrowFunction,
        );
        if (arrowDeclarationChild.length !== 0) {
            continue;
        }
        if (callExpressionChildren.length === 0) {
            continue;
        }
        const variableDeclarationName = currentVariableDeclaration.getName();
        if (variableDeclarationName) {
            currentVariableDeclaration.getStartLineNumber();
            currentVariableDeclaration.getEndLineNumber();
            const codeSymbolInformation = {
                symbolName: moduleName + "." + variableDeclarationName,
                symbolKind: CodeSymbolKind.function,
                symbolStartLine: currentVariableDeclaration.getStartLineNumber(),
                symbolEndLine: currentVariableDeclaration.getEndLineNumber(),
                codeSnippet: {
                    languageId: "typescript",
                    code: currentVariableDeclaration.getText() || "",
                },
                extraSymbolHint: TypescriptCodeType.typescriptFunction,
                dependencies: currentVariableDeclaration.getChildrenOfKind(SyntaxKind.Block)
                    .map((block) => parseCodeBlockForDependencies(
                        block,
                        variableDeclarationName,
                        moduleName,
                        directoryPath,
                        project,
                        sourceFile,
                    ))
                    .reduce((acc, val) => acc.concat(val), []),
                fsFilePath: currentVariableDeclaration.getSourceFile().getFilePath(),
                originalFilePath,
                workingDirectory: directoryPath,
                displayName: `${variableDeclarationName}()`,
                originalName: variableDeclarationName,
                originalSymbolName: variableDeclarationName,
            };
            codeSymbolInformationList.push(codeSymbolInformation);
        }
    }
    return codeSymbolInformationList;
}

function getFunctionSymbolFromFile(
    sourceFile: SourceFile,
    directoryPath: string,
    project: Project,
    originalFilePath: string,
): CodeSymbolInformation[] {
    const moduleName = getCodeLocationPath(
        directoryPath,
        sourceFile.getFilePath(),
    );
    const codeSymbolInformationList: CodeSymbolInformation[] = [];

    const functions = sourceFile.getFunctions();
    for (let index = 0; index < functions.length; index++) {
        const currentFunction = functions[index];
        const functionCodeSymbol = parseFunctionNode(
            currentFunction,
            moduleName,
            directoryPath,
            project,
            sourceFile,
            originalFilePath,
        );
        if (functionCodeSymbol !== null) {
            codeSymbolInformationList.push(functionCodeSymbol);
        }
    }

    const arrowExpressions = sourceFile.getDescendantsOfKind(
        SyntaxKind.ArrowFunction,
    );
    for (let index = 0; index < arrowExpressions.length; index++) {
        const currentArrowExpression = arrowExpressions[index];
        const arrowFunctionSymbol = parseArrowFunctionNode(
            currentArrowExpression,
            null,
            moduleName,
            directoryPath,
            project,
            sourceFile,
            originalFilePath,
        );
        if (arrowFunctionSymbol !== null) {
            codeSymbolInformationList.push(arrowFunctionSymbol);
        }
    }

    const variableDeclarationFunctions = getVariableDeclarationFunctionFromFile(
        sourceFile,
        directoryPath,
        project,
        originalFilePath,
    );
    codeSymbolInformationList.push(...variableDeclarationFunctions);
    return codeSymbolInformationList;
}


// If its a valid import then we get something like this:
// [dependency] Parsing code block for dependencies: searchCodeSymbols
// [dependency] Why is this not working??
// [dependency] Identifier: logger
// [dependency] Symbol: logger
// [dependency] whats the full qualified name: "/Users/skcd/scratch/vscode_plugin/src/codeSymbols/extractFromFile".FileSymbolCache.logger
// Whats the type here: import("vscode").OutputChannel
// [dependency] Identifier: appendLine
// [dependency] Symbol: appendLine
// [dependency] whats the full qualified name: "vscode".OutputChannel.appendLine
// Whats the type here: (value: string) => void
// If the import is valid it will start with your workspace path in the name
// this really translates to check if the qualified name starts with:
// "{full_path}".{symbol_in_file}
// ^ this is very easy to parse, so we can get the edges for the nodes of this
// workspace
function checkIfSymbolIsImportedFromWorkspace(
    fullyQualifiedName: string,
    workingDirectoryPath: string,
    moduleName: string,
): string | null {
    // Check if the fully qualified name starts with the working directory path
    if (!fullyQualifiedName.startsWith(`"${workingDirectoryPath}`)) {
        return moduleName + "." + fullyQualifiedName;
    }

    // We might have a case where the symbol belongs to the current file, since
    // we are going with the best effort route, we can do something about it
    // otherwise building and indexing it up will be hard (we might have to do
    // another pass on dependencies to make sure we dont have nodes which dont
    // exist) (better to be small scoped but do it well)

    // Split the fully qualified name into parts
    const parts = fullyQualifiedName.split(".");
    if (parts.length === 3) {
        const pathPart = parts[0].replace(/"/g, "");
        if (!pathPart.startsWith(workingDirectoryPath)) {
            return null;
        }
        const removePrefix = path.relative(workingDirectoryPath, pathPart);
        return [removePrefix.split("/").filter((pathPart) => pathPart !== "").join("."), parts[1], parts[2]].join(".");
    }
    else if (parts.length === 2) {
        const pathPart = parts[0].replace(/"/g, "");
        if (!pathPart.startsWith(workingDirectoryPath)) {
            return null;
        }
        const removePrefix = path.relative(workingDirectoryPath, pathPart);
        return [removePrefix.split("/").filter((pathPart) => pathPart !== "").join("."), parts[1]].join(".");
    } else {
        return null;
    }
}

function parseCodeBlockForDependencies(
    block: Block,
    blockCodeSymbolName: string,
    moduleName: string,
    workingDirectoryPath: string,
    project: Project,
    sourceFile: SourceFile,
): CodeSymbolDependencies[] {
    const codeSymbolDependencies: CodeSymbolDependencies[] = [];
    block.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpression) => {
        callExpression.getDescendantsOfKind(SyntaxKind.Identifier).forEach((identifier) => {
            const symbol = identifier.getSymbol();
            if (symbol) {
                const qualifiedNamesFromAliasSymbol: CodeSymbolDependencyWithFileInformation[] | undefined = symbol.getAliasedSymbol()?.getDeclarations().map((declaration) => {
                    return {
                        codeSymbolName: declaration.getSymbol()?.getFullyQualifiedName(),
                        filePath: declaration.getSourceFile().getFilePath(),
                    };
                }).filter(
                    (codeSymbolInformation) => codeSymbolInformation.codeSymbolName !== undefined
                ).map(
                    // Stupid typescript type checker
                    (codeSymbolInformation) => codeSymbolInformation as CodeSymbolDependencyWithFileInformation
                );
                const declarations = symbol.getDeclarations();
                // if (declarations.length !== 0) {
                //     return;
                // }
                console.log("[dependency] Identifier: " + identifier.getText() + " " + symbol.getDeclarations()[0]);
                // Not sure why this is happening, but this was causing the
                // extension to crash, so we guard against this
                // if (symbol.getDeclarations()[0] === undefined) {
                //     return;
                // }
                // Fix this later
                let originalDeclaration: CodeSymbolDependencyWithFileInformation = {
                    codeSymbolName: symbol.getFullyQualifiedName(),
                    filePath: "symbol.getDeclarations()[0].getSourceFile().getFilePath()",
                };

                // We pick the aliased symbol name if its present
                if (qualifiedNamesFromAliasSymbol !== undefined && qualifiedNamesFromAliasSymbol?.length !== 0) {
                    for (const aliasQualifiedName of qualifiedNamesFromAliasSymbol) {
                        if (aliasQualifiedName !== undefined) {
                            originalDeclaration = aliasQualifiedName;
                        }
                    }
                }
                const relativeDependency = checkIfSymbolIsImportedFromWorkspace(
                    originalDeclaration.codeSymbolName,
                    workingDirectoryPath,
                    moduleName,
                );
                if (relativeDependency === null) {
                    return;
                }
                const dependency: CodeSymbolDependencies = {
                    codeSymbolName: blockCodeSymbolName,
                    codeSymbolKind: CodeSymbolKind.function,
                    edges: [
                        {
                            codeSymbolName: relativeDependency,
                            filePath: originalDeclaration.filePath,
                        },
                    ],
                };
                codeSymbolDependencies.push(dependency);
                return;
            } else {
                console.log("[dependency] No symbol found, probably imported from another file");
            }
        });
    });
    console.log("[dependency] Code symbol dependencies: " + blockCodeSymbolName + " " + JSON.stringify(codeSymbolDependencies));
    return codeSymbolDependencies;
}

export function parseCodeBlocksForDependencies(
    sourceFile: SourceFile,
    blockCodeSymbolName: string,
    workingDirectoryPath: string,
    moduleName: string,
    project: Project,
): CodeSymbolDependencies[] {
    const blocks = sourceFile.getDescendantsOfKind(SyntaxKind.Block);
    const codeSymbolDependencies: CodeSymbolDependencies[] = [];
    blocks.forEach((block) => {
        const blockDependencies = parseCodeBlockForDependencies(
            block,
            blockCodeSymbolName,
            moduleName,
            workingDirectoryPath,
            project,
            sourceFile,
        );
        blockDependencies.forEach((blockDependency) => {
            if (blockDependency.edges.length > 0) {
                codeSymbolDependencies.push(blockDependency);
            }
        });
    });
    return codeSymbolDependencies;
}


export function parseSourceFile(
    sourceFile: SourceFile,
    project: Project,
    directoryPath: string,
    sourceFilePath: string,
    originalFilePath: string,
): CodeSymbolInformation[] {
    if (sourceFile !== undefined) {
        const classSymbols = getClassSymbolFromFile(
            sourceFile,
            directoryPath,
            project,
            originalFilePath,
        );
        console.log("[ts-morph]Class Symbols from ts-morph: " + sourceFilePath + "   " + classSymbols.length + " " + JSON.stringify(classSymbols));
        const functionSymbols = getFunctionSymbolFromFile(
            sourceFile,
            directoryPath,
            project,
            originalFilePath,
        );
        console.log("[ts-morph]Function Symbols from ts-morph: " + sourceFilePath + "   " + functionSymbols.length + " " + JSON.stringify(functionSymbols.map((value) => `${value.symbolName} ${value.extraSymbolHint}`)));
        const typeAliasSymbols = getTypeAliasFromFile(
            sourceFile,
            directoryPath,
            project,
            originalFilePath,
        );
        // console.log("[ts-morph]Type Alias Symbols from ts-morph: " + sourceFilePath + "   " + typeAliasSymbols.length + " " + JSON.stringify(typeAliasSymbols));
        const interfaceSymbols = getInterfaceSymbolFromFile(
            sourceFile,
            directoryPath,
            project,
            originalFilePath,
        );
        return classSymbols
            .concat(functionSymbols)
            .concat(typeAliasSymbols)
            .concat(interfaceSymbols);
    } else {
        console.log("[ts-morph]Source file is undefined: " + sourceFilePath);
        return [];
    }
}


export function parseFileUsingTsMorph(
    sourceFilePath: string,
    project: Project,
    directoryPath: string,
    originalFilePath: string,
): CodeSymbolInformation[] {
    const sourceFile = project.getSourceFile(sourceFilePath);
    // We sync from the fs again if the file has changed meanwhile, this is not
    // important for onboarding but super important when we are doing things live
    // and on every save
    const syncData = sourceFile?.refreshFromFileSystemSync();
    if (sourceFile) {
        return parseSourceFile(
            sourceFile,
            project,
            directoryPath,
            sourceFilePath,
            originalFilePath,
        );
    } else {
        return [];
    }
}


const project = new Project({});


// Change this value to your linking
// the directory path needs to be set here to the parent of the repo or where your file
// is located, all the symbols will be relative to that.
const directoryPath = process.argv[2]; // Use the absolute path here
const filePath = process.argv[3]; // Use absolute path to the file
const outputFile = process.argv[4]; // The file where you want the output to be present
const originalFilePath = process.argv[5]; // The original file path, symbols will be relative to this

void (async () => {
    console.log(filePath);
    console.log(directoryPath);
    project.addSourceFileAtPath(
        filePath,
    );
    const parsedOutput = parseFileUsingTsMorph(
        filePath,
        project,
        directoryPath,
        originalFilePath,
    );
    const output = {
        "output": parsedOutput,
    };
    JSON.stringify(output);
    fs.writeFileSync(outputFile, JSON.stringify(output));
})();