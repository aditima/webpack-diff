var fs = require("fs");
console.log("\n *START* \n");
// var contents = fs.readFileSync("D:\\GitRepos\\webpack-case-study\\baselinekkjeer\\office-ui-fabric-react\\apps\\test-bundles\\dist\\test-bundles.stats.json");
var contents = fs.readFileSync("test-bundles.stats.json");
var jsonContents = JSON.parse(contents);

var dict = createDictionary(jsonContents)

var output = []
for (i=0;i<jsonContents.assets.length;i++)
{
    var jsonContent = jsonContents.assets[i];
    console.log("assets : "+ i + " : " + JSON.stringify(jsonContent));
    console.log("name : " + jsonContent.name)
    
    var chunks = jsonContent.chunks
    var dependencies = [];
    for(j=0;j<chunks.length;j++){
        dependencies.push(dict[chunks[j]])
    }
    console.log(dependencies)

    output.push({
        "serial": i,
        "name":jsonContent.name,
        "dependencies":dependencies
    })
    console.log("\n");    
}

fs.writeFile('dependencygraph.json', JSON.stringify(output), function (err) {
    if (err) 
        return console.log(err);
    console.log('output written to file: dependencygraph.json');
});

function createDictionary(jsonContents){
    var dict = [];
    for(i=0;i<jsonContents.assets.length;i++){
        dict.push(jsonContents.assets[i].name)
    }
    return dict;
}