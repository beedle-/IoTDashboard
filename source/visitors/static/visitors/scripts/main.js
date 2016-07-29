/*
 -----------------------------------------------------------------------------------
 File     : main.js
 Author   : Rouiller Bastien
 Date     : 29.07.2016

 Goal     : Implement the web console
 -----------------------------------------------------------------------------------
*/

// Get current URL in order to make the code adaptive
host = window.location.href;

//--- Define constant values

// Measurements speed  categories in km/h
walkingSpeed = 20;
carSpeed = 80;
highwaySpeed = 120;


// Color schemes human-friendly
// Source: http://colorbrewer2.org/
// 9 color
defaultColorScheme = ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"];

// 3 colors
simpleColorScheme = ["#ffeda0", "#feb24c", "#f03b20"];

// Default config for color scale
colorScheme = defaultColorScheme;
speedScale = "default";

// Set the color of selected and excluded data
selectionColor = "#298A08";
exclusionColor = "#0066cc";

// store the sensor types
tabSensors = ["Android", "iOS"];



//todo : le mettre ailleurs mais doit s'éxcuter en début
getStats();

secondMapBigger = false;

// true when user push Recenter the Map button
// avoid to load data when before the map centered to the data
mapReset = false;

// Allow to only load once each of the total data (sensor, time, speed) because it never changes
sensorTotalDataLoaded = false;
hourTotalDataLoaded = false;
speedTotalDataLoaded = false;

// Count the number of access to server data
// When 0, no data is accessed so the user can use the controls
wait = 0;

// Initialize variables that store the state of the sliders
tmpStartDateHour = null;
tmpEndDateHour = null;
tmpStartDate = null;
tmpEndDate = null;
tmpStartSpeed = null;
tmpEndSpeed = null;

// Used for the path selection, inform if a specific sensor have been selected
idSensorSelected = "";


//--- Define bounds for speed values
speedMinIncludeInvalid = -1;

speedMinBound = 0;
speedMaxBound = 160;

speedMin = speedMinIncludeInvalid;
speedMax = speedMaxBound;

// A different behavior is adopted for the first loading of the console
firstTime = 0;


// initialize default value for the last X min selected
tLast = 0;
minutesInterval = 5;

initialize();

// Initialize the maps
function initialize()
{
    // Init the main map with the controls
    initSecondMap();

    // Init the second map used for the heatmap
    initMainMap();

    // By default, all sensor types are displayed
    sensorType="";

    // Set minimum time to the 1st January 2014 and maximum date to today
    tMin = 1388530800000;
    tMax = new Date().getTime();

    // Distortion because of longitude latitude, 1 lng != 1 lat in pixel
    ratioLat = (mapBounds._northEast.lat - mapBounds._southWest.lat)/divMapHeight;
    ratioLon = (mapBounds._northEast.lng-mapBounds._southWest.lng)/divMapWidth;

    // Once we got the ratio between Lon and Lat, we can correctly draw squares
    ratioLonLat = ratioLon/ratioLat;

    // We set the default number of squares (vertically)
    squareNbHeight = 15;

    // We get the size in pixels in order to have 15 squares vertically
    squareSizeInPixel = divMapHeight/squareNbHeight;

    // Map the controls to the action
    initSquareSize();
    initColorScale();
    initLast();
    initSensor();
    initSpeed();

    // Zoom the map on the actual data selected through the crossfilter
    defineMapBounds();

    // Init the prediciton, by default based on the last week
    initPrediction();
}

// Initialize the main map
function initMainMap()
{
    //## Use OpenStreetMap default tile
    myMap = new L.Map("mapid", {center: [46.801111, 8.226667], zoom: 8})
        .addLayer(new L.TileLayer("http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"));

    // Initialize the SVG layer
    myMap._initPathRoot();

    // At each zoom (in or out) on the map we need to refresh the circles
    myMap.on('zoomend', function()
    {
        //when resetting map view it trigger zoomend, we went to prevent refreshing in this case
        if(!mapReset)
            refresh("mapMove");

        mapReset = false;
    });

    myMap.on('dragend', function()
    {
        refresh("mapMove");

        mapReset = false;
    });

    // add controls to the map
    addControls();

    // Get div dimension in order to correctly draw figures inside
    divMapHeight = document.getElementById('mapid').clientHeight;
    divMapWidth = document.getElementById('mapid').clientWidth;

    // We get the GPS coordinate of the top left and bottom right corner of the map
    mapBounds = myMap.getBounds();
    minLat = mapBounds._southWest.lat;
    minLon = mapBounds._southWest.lng;
    maxLat = mapBounds._northEast.lat;
    maxLon = mapBounds._northEast.lng;
}


// Initialize the second map that will contain the heatmap
function initSecondMap()
{
    secondMap = new L.Map("secondMap", {center: [46.801111, 8.226667], zoom: 8})
        .addLayer(new L.TileLayer("http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"));

    addControlSecondMap();
    initHeatmapInterval();

    // We get the GPS coordinate of the top left and bottom right corner of the map
    var mapBounds = secondMap.getBounds();
    minLatSecond = mapBounds._southWest.lat;
    minLonSecond = mapBounds._southWest.lng;
    maxLatSecond = mapBounds._northEast.lat;
    maxLonSecond = mapBounds._northEast.lng;

    // Configure the behavior when clicking on the "Click to enlarge button"
    d3.select("#enlargeSecondMap").on("click", function()
    {
        getNewBounds();

        if(secondMapBigger == false)
        {
            //console.log("Second Map enlarged");

            // make the second map bigger
            d3.select("#secondMap")
                .style("width", "100%")
                .style("height", "600px");

            // update the map with the new size
            secondMap.invalidateSize();

            secondMapBigger = true;
        }
        else
        {
            //console.log("Second Map enlarged");

            // reduce the second map
            d3.select("#secondMap")
                .style("width", "40%")
                .style("height", "300px");

            // update the map with the new size
            secondMap.invalidateSize();

            secondMapBigger = false;
        }

    });

    // When moving the map we need to download measurement for the new location
    secondMap.on('zoomend', function()
    {
        getNewBounds();
    });

    secondMap.on('dragend', function()
    {
        getNewBounds();
    });

}


// Set the action when selecting a time interval for the path visualization
function initLast()
{
    d3.select("#lastData").selectAll("input")
        // set time interval
        .on("click",function(){

            //vérifier d'ou vient barChart
            var timeBounds = barChartHour.filters()[0];
            var startDate = timeBounds[0];
            var endDate = timeBounds[1];
            tMin = new Date(startDate).getTime();
            tMax = new Date(endDate).getTime();

            //if we selected last X minutes, set the variable tLast
            if(this.id != "notLast")
            {
                tLast = this.id * 1000 * 60;  //convert minute to ms
            }
            else  // if we don't
            {
                tLast = 0;      //"desactivate" tLast
            }

            refresh("lastMin");
        });
}

// Set the behavior of sensor type checkboxes
function initSensor()
{
    d3.select("#selectType")
        .selectAll("input")
        .on("click",function()
        {
            sensorType = this.id;

            refresh("sensor");

            // Check if no measurements were made with this device
            if ((sensorType == "" && sensorSelectedTotal == 0) || dataJsonSelectedSensors[sensorType] == 0)
            {
                d3.select("#mapid").append("p")
                    .attr("id", "noDataOnMap")
                    .style({"background-color": "steelblue"})
                    .style({"position": "absolute"})
                    .style({"color": "white"})
                    .style({"margin-top": "-33px"})
                    .style({"margin-left": "-33px"})
                    .style({"top": "50%"})
                    .style({"left": "43%"})
                    .style({"font-size": "15px"})
                    .text("No measurements in this area with these filters");
            }
            // if there is data, remove the warning message
            else
            {
                d3.selectAll("#noDataOnMap").remove();
            }
        });
}


// Set the behavior of checkbox that enable the speed range selection
function initSpeed() {
    d3.select("#selectSpeed")
        .on("click", function ()
        {
            //console.log("speed click");

            //checked
            if (d3.select("#selectSpeed").property("checked"))
            {
                // when the speed selection is activated, all the measurements with speed are selected
                //console.log("speed checked");

                speedMin = speedMinBound;
                speedMax = speedMaxBound;
                barChartSpeed.filter(dc.filters.RangedFilter(speedMinBound, speedMaxBound));

                dc.renderAll();

                refresh("speed");
            }
            //unchecked
            else
            {
                // when the speed selection is desactivated, also show measurements with no indication of speed
                //console.log("speed unchecked");

                speedMin = speedMinIncludeInvalid;
                speedMax = speedMaxBound;
                barChartSpeed.filter(null);

                // Reset the variables that contains the state of the slider
                tmpStartSpeed = null;
                tmpEndSpeed = null;

                dc.renderAll();

                refresh("speed");
            }
        });
}

// Display circle by accessing data in the DB through the REST API
function show_circles()
{
    dataLoading("Circles");

    var query = encodeQueryData({'minLat': minLat, 'maxLat': maxLat, 'minLon': minLon, 'maxLon': maxLon, 'tMin': tMin, 'tMax': tMax, 'sensorType': sensorType, 'ratioLonLat': ratioLonLat, 'squareNbHeight': squareNbHeight, 'speedMin': speedMin, 'speedMax': speedMax});

    // Access the "REST" API
    d3.json(host + "countsBySquare?" + query, function (error, json)
    {
        if (error)
            return console.warn(error);

        var dataJson = JSON.parse(json);

        // Due to "distortion" 1px in Longitude is not same as 1 px in Latitude. So we need correct degree to draw square in pixel
        var squareSizeLat = dataJson.squareSizeLat;
        var squareSizeLon = dataJson.squareSizeLon;

        var dataArray = dataJson.items;

        // Depending on the mongoDB version, the json might vary
        if(dataArray.hasOwnProperty('result'))
            dataArray = dataArray.result;

        var maxCount = 0;
        var maxSpeed = 0;

        // Get the highest number of coordinates in one area
        for (i = 0; i < dataArray.length; i++) {
            if (dataArray[i].count > maxCount)
                maxCount = dataArray[i].count;

            if (dataArray[i].avgSpeed > maxSpeed)
                maxSpeed = dataArray[i].avgSpeed;
        }

        // Make a LatLng objet for each circles that store the location on the map
        dataArray.forEach(function (d) {
            d.LatLng = new L.LatLng(d._id.latGroup + squareSizeLat / 2, d._id.lonGroup + squareSizeLon / 2)
        });

        // Create a new g element that contains the svg circles
        var svg = d3.select("#mapid").select("svg");
        var g = svg.append("g").attr("id", "circles");

        g.selectAll("circle")
            .data(dataArray)
            .enter()
            // Bind each value of the array to a different circle
            .append("circle")
            .style("stroke", "black")
            // Set the circle's color depending on the average speed in the area
            .style("fill", function (d)
            {
                    return getColorCategory(d.avgSpeed, maxSpeed)
            })
            // Set the size depending on the number of measurements
            .attr("r", function (d)
            {
                var size = d.count / maxCount * squareSizeInPixel / 2;

                // Set a minimal size
                if (size < 3)
                    size = 3;

                return size;
            })
            // Move to the exact location
            .attr("transform", function (d)
                {
                    return "translate(" +
                        myMap.latLngToLayerPoint(d.LatLng).x + "," +
                        myMap.latLngToLayerPoint(d.LatLng).y + ")";
                })
            // Add text for the mouseover
            .append("title")
            .text(function (d)
            {                                                          // m/s to km/h
                return "Count: " + d.count + " measurements\nAverage speed: " + (Number(d.avgSpeed) * 3.6).toFixed(2) + " km/h\n";
            });

        if(dataArray.length != 0)
            drawLegendCircles(maxSpeed, maxCount);

        //http://stackoverflow.com/questions/17786618/how-to-use-z-index-in-svg-elements
        // Put arrows on top of circles, otherwise we can not correctly see the arrows
        svg.append("use")
            .attr("xlink:href", "#arrows");

        checkIfDataLoaded("Circles");
    });
}

// Display arrow in each area representing the bearing (direction) and the speed (length)
function show_arrows()
{
    dataLoading("Arrows");

    var query = encodeQueryData({'minLat': minLat, 'maxLat': maxLat, 'minLon': minLon, 'maxLon': maxLon, 'tMin': tMin, 'tMax': tMax, 'sensorType': sensorType, 'ratioLonLat': ratioLonLat, 'squareNbHeight': squareNbHeight,'speedMin': speedMin, 'speedMax': speedMax});

    // Access the "REST" API
    d3.json(host + "directionsBySquare?" + query, function (error, json) {
        if (error)
            return console.warn(error);

        var dataJson = JSON.parse(json);

        // Due to "distortion" 1px in Longitude is not same as 1 px in Latitude. So we need correct degree to draw square in pixel
        var squareSizeLat = dataJson.squareSizeLat;
        var squareSizeLon = dataJson.squareSizeLon;

        var tabData = dataJson.items;

        // Depending on the mongoDB version, the json might vary
        if(tabData.hasOwnProperty('result'))
            tabData = tabData.result;

        var maxSpeed = 0;

        // Get the highest number of coordinates in one area
        for (i = 0; i < tabData.length; i++)
        {
            if (tabData[i].avgSpeed > maxSpeed)
                maxSpeed = tabData[i].avgSpeed;
        }

        var svg = d3.select("#mapid").select("svg");
        var g = svg.append("g").attr("id", "arrows");

        // Make a LatLng objet for each circles that store the location on the map
        tabData.forEach(function (d) {
            d.LatLng = new L.LatLng(d._id.latGroup + squareSizeLat / 2, d._id.lonGroup + squareSizeLon / 2)
        });

        // Create a marker that will be used as a head at the end of each line in order to draw an arrow
        // source :  arrow head http://xn--dahlstrm-t4a.net/svg/markers/simple-marker.svg
        svg.append("marker")
            .attr("id", "triangle")
            .attr("viewBox", "0 0 10 10")
            .attr("refX", 0)
            .attr("refY", 5)
            .attr("markerUnits", "strokeWidth")
            .attr("markerWidth", 5)
            .attr("markerHeight", 5)
            .attr("orient", "auto")
            .html('<path d="M 0 0 L 10 5 L 0 10 z" />');


        // Draw the lines
        g.selectAll("line")
            .data(tabData)
            .enter().append("line")
            .attr("x1", function (d) {
                return myMap.latLngToLayerPoint(d.LatLng).x
            })
            .attr("x2", function (d) {
                if (d.avgBearing == 0 || maxSpeed == 0)  //avoid dividing by 0
                    return myMap.latLngToLayerPoint(d.LatLng).x;
                else
                    return myMap.latLngToLayerPoint(d.LatLng).x + (d.avgSpeed / maxSpeed) * (squareSizeInPixel / 2);
            })
            .attr("y1", function (d) {
                return myMap.latLngToLayerPoint(d.LatLng).y
            })
            .attr("y2", function (d) {
                return myMap.latLngToLayerPoint(d.LatLng).y
            })
            .style("stroke", "black")
            // append the arrow head
            .attr("marker-end", "url(#triangle)")
            .attr("transform",
                function (d) {
                    return "rotate(" +
                        (d.avgBearing - 90) + "," +
                        myMap.latLngToLayerPoint(d.LatLng).x + "," +
                        myMap.latLngToLayerPoint(d.LatLng).y + ")";
                });

        if(tabData.length != 0)
            drawLegendArrows(maxSpeed);

        checkIfDataLoaded("Arrows");

    });
}

// Display a path that users take during the last x minutes selected
function show_GPSPaths()
{
    dataLoading("GPSPaths");

    if(tLast == 0)
        tMinPath = tMin;
    else
        tMinPath = tMax - tLast;

    //console.log(idSensorSelected);

    var query;

    // If we did not select a specific path (by default), load the measurements for all sensors (according to the parameters)
    if(idSensorSelected == "" )
    {
        query = encodeQueryData({
            'minLat': minLat,
            'maxLat': maxLat,
            'minLon': minLon,
            'maxLon': maxLon,
            'tMin': tMinPath,
            'tMax': tMax,
            'speedMin': speedMin,
            'speedMax': speedMax,
            'sensorType': sensorType
        });

        d3.json(host + "paths?" + query, function (error, json)
        {
            if (error)
                return console.warn(error);

            var dataJson = JSON.parse(json);
            var tabPath = dataJson.GPSPath;

            // Iterate on devices
            for (var i = 0; i < tabPath.length - 1; i++)
            {
                drawPath(tabPath[i])
            }

            d3.select("#pathSelection").html(" |  Click to select a path");

            checkIfDataLoaded("GPSPaths");
        });
    }
    // if we selected a specific path, only request data for this one
    else
    {
        //console.log("path selected");

        query = encodeQueryData({
            'idSensor': idSensorSelected,
            'minLat': minLat,
            'maxLat': maxLat,
            'minLon': minLon,
            'maxLon': maxLon,
            'tMin': tMinPath,
            'tMax': tMax,
            'speedMin': speedMin,
            'speedMax': speedMax
        });
        d3.json(host + "pathFromSensor?" + query, function (error, json)
        {
            if (error)
                return console.warn(error);

            var GPSData = JSON.parse(json);

            drawPath(GPSData);

            checkIfDataLoaded("GPSPaths");
        });
    }
}


// Refresh the overlay drawed on the map
//### action - User action, a dispatcher will refresh elements depending on the action
function refresh(action)
{
    d3.select("#noDataOnMap").remove();

    // Map bounds might change when refreshing
    mapBounds = myMap.getBounds();

    minLat = mapBounds._southWest.lat;
    minLon = mapBounds._southWest.lng;
    maxLat = mapBounds._northEast.lat;
    maxLon = mapBounds._northEast.lng;

    // Dispatcher for the user action
    switch(action)
    {
        case "mapMove":
            refreshAll();
            break;
        case "lastMin":
            refreshPaths();
            break;
        case "sensor":
            refreshAll("exceptSensor");
            break;
        case "date":
            refreshAll("exceptDate");
            break;
        case "speed":
            refreshAll("exceptSpeed");
            break;
        case "circlesControl":
            refreshCircles();
            break;
        case "arrowsControl":
            refreshArrows();
            break;
        case "GPSPathsControl":
            refreshPaths();
            break;
    }
}

// Get the different kinds of sensor
function show_sensorBarchart()
{
    loadSensorTotalData(function()
    {
        var query = encodeQueryData({'minLat': minLat, 'maxLat': maxLat, 'minLon': minLon, 'maxLon': maxLon, 'tMin': tMin, 'tMax': tMax, 'speedMin': speedMin, 'speedMax': speedMax});

        d3.json(host + "sensorCounts?" + query, function(error, jsonSelected)
        {
            if (error)
                return console.warn(error);

            dataJsonSelectedSensors = JSON.parse(jsonSelected);

            sensorSelectedTotal = 0;

            tabSensors.forEach(function (d) {
                sensorSelectedTotal += dataJsonSelectedSensors[d];
            });

            d3.selectAll(".sensorBar")
                .style({"background-color": exclusionColor})
                .style({
                    "width": function () {
                        if (this.id == "all")
                            return (sensorCountTotal - sensorSelectedTotal) / sensorCountTotal * 100 + "%";
                        else
                            return ((dataJsonTotal[this.id] - dataJsonSelectedSensors[this.id]) / sensorCountTotal * 100 + "%");
                    }
                })
                .style({
                    "border-left": function () {
                        if (this.id == "all")
                            return sensorSelectedTotal / sensorCountTotal * 200 + "px solid " + selectionColor;
                        else
                            return dataJsonSelectedSensors[this.id] / sensorCountTotal * 200 + "px solid" + selectionColor;
                    }
                })
                .html("&nbsp;");

            d3.selectAll(".countSensor")
                .text(function(){
                    if(this.id == "all")
                        return "(" + Humanize.compactInteger(sensorSelectedTotal,1) + ")";
                    else
                        return "(" + Humanize.compactInteger(dataJsonSelectedSensors[this.id],1) + ")";
                });

            // If no measurements are actually selected with the filters
            if ((sensorType == "" && sensorSelectedTotal == 0) || dataJsonSelectedSensors[sensorType] == 0)
            {
                d3.select("#mapid").append("p")
                    .attr("id", "noDataOnMap")
                    .style({"background-color": "steelblue"})
                    .style({"position": "absolute"})
                    .style({"color": "white"})
                    .style({"margin-top": "-33px"})
                    .style({"margin-left": "-33px"})
                    .style({"top": "50%"})
                    .style({"left": "43%"})
                    .style({"font-size": "15px"})
                    .text("No measurements in this area with these filters");
            }
            else
            {
                d3.selectAll("#noDataOnMap").remove();
            }
        });
    });
}

// Based on http://www.codeproject.com/Articles/697043/Making-Dashboards-with-Dc-js-Part-2-Graphing
function displayDateRangeSlider()
{
    dataLoading("Date Range Slider");

    //Check if total data have been loaded before
    loadHourTotalData(function()
    {
        var dataJsonTotalDate = JSON.parse(tmpJsonTotalHour);

        datasetTotalHour = dataJsonTotalDate.measurementsByHourTotal;

        // Depending on the mongoDB version, the json might vary
        if(datasetTotalHour.hasOwnProperty('result'))
            datasetTotalHour = datasetTotalHour.result;

        var query = encodeQueryData({'minLat': minLat, 'maxLat': maxLat, 'minLon': minLon, 'maxLon': maxLon, 'tMin': tMin, 'tMax': tMax, 'sensorType': sensorType, 'speedMin': speedMin, 'speedMax': speedMax});

        // Access the "REST" API.
        d3.json(host + "measurementsByHour?" + query, function (error, json) {
            if (error)
                return console.warn(error);


            d3.select("#chart-line-hitsperday").html("");

            var dataJson = JSON.parse(json);

            dataset = dataJson.measurementsByHour;

            // Depending on the mongoDB version, the json might vary
            if(dataset.hasOwnProperty('result'))
                dataset = dataset.result;

            if (datasetTotalHour.length != 0)
            {
                var barChartDate = dc.barChart("#chart-line-hitsperday");

                var ndx = crossfilter(datasetTotalHour);

                dataset.forEach(function (a)
                {
                    // UTC to gmt+2
                    a._id.hourGroup.$date = a._id.hourGroup.$date - (2*60*60*1000);
                });

                // Iterate over the dataset that contains all data
                // Merge it with the dataset that contains selected data
                datasetTotalHour.forEach(function (d)
                {
                    // UTC to gmt+2
                    d._id.hourGroup.$date = d._id.hourGroup.$date - (2*60*60*1000);

                    //todo : voir si il faut vérifier l'heure  et le fuseau avant d'arrondir au jour
                    //d.date = Date.parse(d._id.year + "/" + d._id.month + "/" + d._id.day);
                    var tmpDate = new Date(d._id.hourGroup.$date);
                    d.date = Date.parse(tmpDate.getFullYear() + "/" + (tmpDate.getMonth() + 1) + "/" + tmpDate.getDate());

                    dataset.forEach(function (a)
                    {
                        if (a._id.hourGroup.$date === d._id.hourGroup.$date)
                            d.countSelected = a.count;
                    });

                    if (!d.hasOwnProperty("countSelected"))
                        d.countSelected = 0;

                    d.countExcluded = d.countTotal - d.countSelected;

                });

                var dateDim = ndx.dimension(function (d) {
                    return d.date;
                });

                var countSelectedByDay = dateDim.group().reduceSum(function (d) {
                    return d.countSelected;
                });

                var countTotalByDay = dateDim.group().reduceSum(function (d) {
                    return d.countExcluded;
                });


                if (firstTime < 2) {
                    minDateD = dateDim.bottom(1)[0].date;
                    maxDateD = dateDim.top(1)[0].date;
                    firstTime++;
                }

                var dateNow = new Date().getTime();

                barChartDate
                    .height(100)
                    .dimension(dateDim)
                    .group(countSelectedByDay)
                    .stack(countTotalByDay)
                    .x(d3.time.scale().domain([minDateD, dateNow + (24 * 60 * 60 * 1000)]))
                    .xUnits(function () {       //refresh the number of bar in order to have dynamic size
                        //return (barChartDate.xAxisMax() - barChartDate.xAxisMin()) / (1000 * 60 * 60 * 24);
                        return (maxDateD - minDateD) / (1000 * 60 * 60 * 24);
                    })
                    //.filter(dc.filters.RangedFilter(minDateD, maxDateD))
                    .margins({top: 10, right: 10, bottom: 20, left: 60})
                    .ordinalColors([selectionColor, exclusionColor])       //define barchart
                    .yAxis().ticks(2);

                // if we memorized a previous position, restored it. Otherwise, filter has default position
                if (tmpStartDate == null && tmpEndDate == null)
                    barChartDate.filter(dc.filters.RangedFilter(minDateD, dateNow + (24 * 60 * 60 * 1000)));
                else
                    barChartDate.filter(dc.filters.RangedFilter(tmpStartDate, tmpEndDate));

                //-- get initial tMin and tMax
                var timeBounds = barChartDate.filters()[0];
                var startDate = timeBounds[0];
                var endDate = timeBounds[1];

                tMin = new Date(startDate).getTime();
                tMax = new Date(endDate).getTime();

                dc.renderAll();

                var brush = barChartDate.brush();

                brush.on('brushend.foo', function ()  //namespace to avoid overwriting existing method
                {
                    var timeBounds = barChartDate.filters()[0];
                    var startDate = timeBounds[0];
                    var endDate = timeBounds[1];

                    tmpStartDate = startDate;
                    tmpEndDate = endDate;

                    // reset the other slider range
                    tmpStartDateHour = null;
                    tmpEndDateHour = null;

                    tMin = new Date(startDate).getTime();
                    tMax = new Date(endDate).getTime();

                    // memorize previous data
                    tMinTmp = tMin;

                    //console.log("Slider 1 changed to" + new Date(tMin) + " to " + new Date(tMax));

                    displayHourRangeSlider();

                    refresh("date");
                });

                displayHourRangeSlider();
            }
            else
            {
                d3.select("#chart-line-hitsperhour").html("");
                d3.select("#chart-line-hitsperday").append("p")
                    .style({"background-color": "steelblue"})
                    .style({"text-align": "center"})
                    .style({"color": "white"})
                    .style({"vertical-align": "middle"})
                    //.text("No data in this area");
            }

            checkIfDataLoaded("Date Range Slider");
        });
    });
}

// Display the control for the fine-grained selection composed by an aggregation of hour on a histogram
function displayHourRangeSlider()
{
    dataLoading("Hour range slider");

    if (dataset.length != 0)
    {
        d3.select("#chart-line-hitsperhour").html("");
        barChartHour = dc.barChart("#chart-line-hitsperhour");

        var ndx = crossfilter(datasetTotalHour);

        datasetTotalHour.forEach(function (d)
        {
            var tmpDate = new Date(d._id.hourGroup.$date);

            d.dateHour = Date.parse(tmpDate.getFullYear() + "/" + (tmpDate.getMonth() + 1) + "/" + tmpDate.getDate() + " " + tmpDate.getHours() + ":00:00");
        });


        var dateDim = ndx.dimension(function (d) {
            return d.dateHour;
        });

        var countSelectedByDay = dateDim.group().reduceSum(function (d) {
            return d.countSelected;
        });

        var countTotalByDay = dateDim.group().reduceSum(function (d) {
            return d.countExcluded;
        });

        var minDate = tMin - tMin % (1000 * 60 * 60);  // only keep hours
        var maxDate = tMax - tMax % (1000 * 60 * 60);

        barChartHour
            .height(100)
            .dimension(dateDim)
            .group(countSelectedByDay)
            .stack(countTotalByDay)
            .x(d3.time.scale().domain([minDate, maxDate]))
            //refresh the number of bar in order to have dynamic size
            .xUnits(function () {
                return (maxDate - minDate) / (1000 * 60 * 60);
            })
            .margins({top: 10, right: 10, bottom: 20, left: 60})
            .ordinalColors([selectionColor, exclusionColor])
            .yAxis().ticks(2);


        //change--------------
        var filterMinDate, filterMaxDate;

        if (tmpStartDateHour == null && tmpEndDateHour == null)
        {
            filterMinDate = minDate;
            filterMaxDate = maxDate;
        }
        else
        {
            filterMinDate = tmpStartDateHour;
            filterMaxDate = tmpEndDateHour;
        }

        // Set the filter (when moving the map, filter should stay the same)
        barChartHour.filter(dc.filters.RangedFilter(filterMinDate, filterMaxDate));

        // Get the total of selected measurements
        var sumSelected = dateDim.groupAll().reduceSum(function(d) {if(d.dateHour > filterMinDate && d.dateHour < filterMaxDate) return d.countSelected; else  return 0;});
        var countSelected = sumSelected.value();

        var sumAll = dateDim.groupAll().reduceSum(function(d) {return d.countSelected + d.countExcluded;});
        var countTotal = sumAll.value();

        var sizeSelected = (countSelected/countTotal) * dbSize;
        var sizeSelectedMB = sizeSelected;

        d3.select('#selectedMeasurements').html("<b>"+ Humanize.compactInteger(countSelected,1) + "</b> out of <b>" + Humanize.compactInteger(countTotal,1) + "</b> measurements are selected for a size of <b>" + Humanize.fileSize(sizeSelectedMB) + "</b> out of <b>" + Humanize.fileSize(dbSize)+ "</b>.");

        drawSizeChart(sizeSelected);


        dc.renderAll();

        var brush = barChartHour.brush();


        brush.on('brushend.foo', function ()  //namespace to avoid overwriting existing method
        {
            var timeBounds = barChartHour.filters()[0];
            var startDate = timeBounds[0];
            var endDate = timeBounds[1];

            tmpStartDateHour = startDate;
            tmpEndDateHour = endDate;

            tMin = new Date(startDate).getTime(); //- (2* 60 * 60 * 1000);
            tMax = new Date(endDate).getTime(); //- (2* 60 * 60 * 1000);

            // memorize previous data
            tMinTmp = tMin;

            //console.log("Slider 2 changed to" + new Date(tMin) + " to " + new Date(tMax));

            // refresh the amount of selected data
            sumSelected = dateDim.groupAll().reduceSum(function(d) {if(d.dateHour > tMin && d.dateHour < tMax) return d.countSelected; else  return 0;});
            var countSelected = sumSelected.value();

            d3.select('#selectedMeasurements').html("<b>" + Humanize.compactInteger(countSelected,1) + "</b> out of <b>" + Humanize.compactInteger(countTotal,1) + "</b> measurements are selected for a size of <b>" + Humanize.fileSize((countSelected/countTotal) * dbSize) + "</b> out of <b>" + Humanize.fileSize(dbSize)  + "<b>.");

            drawSizeChart((countSelected/countTotal) * dbSize);

            refresh("date");

        });
    }

    checkIfDataLoaded("Hour range slider");
}

// Zoom the map on the actual data selected through the crossfilter, inside Swirzerland. Measurements outside switzerland will be ignored
function defineMapBounds()
{
    dataLoading("Map Bounds");
    //console.log("Center the map for the data between " + new Date(tMin) + " and " + new Date(tMax));

    // The query use the extreme GPS coordinates of Switzerland
    // source : https://en.wikipedia.org/wiki/List_of_extreme_points_of_Switzerland
    var query = encodeQueryData({'minLat': 45.817789, 'maxLat': 47.814094, 'minLon': 5.956286, 'maxLon': 10.49194, 'tMin': tMin, 'tMax': tMax, 'speedMin': speedMin, 'speedMax': speedMax});

    d3.json(host + "mapBounds?" + query, function(error, json)
    {
        if (error)
            return console.warn(error);

        var dataJson = JSON.parse(json);

        // If there is no data (within Switzerland and with the filters), the map do not need to zoom and stay on the Switzerland view
        if(dataJson.hasOwnProperty('bounds'))
        {
            var dataset = dataJson.bounds;

            var southWest = L.latLng(dataset.minLat, dataset.minLon),
                northEast = L.latLng(dataset.maxLat, dataset.maxLon),
                bounds = L.latLngBounds(southWest, northEast);

            myMap.fitBounds(bounds);
        }

        //console.log("New bounds :" + southWest + "/" + northEast);

        checkIfDataLoaded("Map Bounds");
    });
}

// Increment a counter each time a vizualisation or a histogramm is loading in order to disable user interaction and to a spinner
//### origin - Visualization methods or histograms that is starting to load
function dataLoading(origin)
{
    //console.log("Data for | " + origin + " | is loading.");

    disableInteraction(myMap);

    if(origin != "Sensor Bar Chart")
        wait++;

    // disable controls
    d3.select("#crossfiltersControls")
        .style("background-color", "white")
        .style("opacity", 0.5)
        .style("pointer-events", "none");

    // display a spinner
    d3.select("#img_loading")
        .style("opacity", 1)
        .style("display", "initial");

    d3.select("#resetMap").attr("disabled", "disabled");
}


// When a visualization is done loading, decrement a counter. When the counter reach one, allow user interaction
//### origin - Visualization methods or histograms that has finished loading
function checkIfDataLoaded(origin)
{
    if(origin != "Sensor Bar Chart")
        wait--;

    //console.log("Loading for | " + origin + " | is done.");

    if(wait == 0)
    {
        //console.log("activated controls");

        // enable controls
        d3.select("#crossfiltersControls")
            .style("background-color", null)
            .style("opacity", null)
            .style("pointer-events", null);

        d3.select("#img_loading")
            .style("display", "none");

        enableInteraction(myMap);

        d3.select("#resetMap").attr("disabled", null);
    }
}

// Get the total of measurements for each sensor if it was not retrived before
function loadSensorTotalData(callback)
{
    if(!sensorTotalDataLoaded)
    {
        d3.json(host + "sensorCountsTotal", function(error, jsonTotal)
        {
            if (error)
                return console.warn(error);


            dataJsonTotal = JSON.parse(jsonTotal);

            sensorCountTotal = 0;

            tabSensors.forEach(function(d)
            {
                sensorCountTotal += dataJsonTotal[d];
            });

            sensorTotalDataLoaded = true;

            callback();
        });
    }
    else
        callback();
}

// Get the total meausrements by hour if it was not retrieved before
function loadHourTotalData(callback)
{
    if(!hourTotalDataLoaded)
    {
        var query = encodeQueryData({'tMin': tMin, 'tMax': tMax});

        // Access the "REST" API.
        d3.json(host + "measurementsByHourTotal?" + query, function (error, jsonTotal)
        {
            if (error)
                return console.warn(error);

            tmpJsonTotalHour = jsonTotal;
            hourTotalDataLoaded = true;

            callback();
        });
    }
    else
        callback();
}

// Lighten or darken a color copied from :
//http://stackoverflow.com/questions/5560248/programmatically-lighten-or-darken-a-hex-color-or-rgb-and-blend-colors
function shadeColor(color, percent)
{
    var f=parseInt(color.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
    return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
}

// Get statistics about the database server such as the database size and the disk space left
function getStats()
{
    d3.json(host + "statistics", function(error, json)
    {
        if (error)
            return console.warn(error);

        var dataJSON = JSON.parse(json);

        // size use on the disk (= dataSize after compressed)
        if(dataJSON.hasOwnProperty('fileSize'))
            dbSize = dataJSON.fileSize;
        else
        {
            //unable to get dbSize on Windows, get arbitrary value.
            dbSize = 4226809856;
        }

        // arbitrary size for disk
        // todo : get real size
        diskSpaceLeft = dataJSON.diskSpaceLeft;

        //draw "empty" bar chart, waiting to get selected data;
        drawSizeChart(0);
    });

}

// Draw a chart representing the space taken by the selection and the database on the disk and also show the space left
//### sizeSelected - Size in byte of the selected measurements
function drawSizeChart(sizeSelected)
{
    var chartWidth = 120;
    var chartHeight = 290;

    var padding = 60;

    d3.select("#sizeChart").html("");

    var svg = d3.select("#sizeChart").append("svg");
    var canvas = svg.attr({width: chartWidth + (2*padding), height: chartHeight});

    var labels = ["Disk size left: ", "DB size : ", "Selection size : "];
    var values = [diskSpaceLeft, dbSize - sizeSelected, sizeSelected];
    var totVal = [diskSpaceLeft, dbSize, sizeSelected];

    var colours = ['#C0C0C0', exclusionColor, selectionColor];

    var data = [];

    var yOffset = 0;

    //Process the data
    for(var i = 0; i < values.length; i++) {

        var datum =
        {
            label: labels[i],
            value : values[i],
            colour : colours[i],
            size: (values[i]/(diskSpaceLeft + dbSize)) * chartHeight,
            x: 0,
            y: yOffset
        };

        yOffset += datum.size;

        data.push(datum)

    }

    var bars = canvas.selectAll('rect').data(data);

    bars
        .enter()
        .append('rect')
        .attr({
            width : chartWidth,
            height : function(d)
            {
                return d.size;
            },
            y : function(d)
            {
                return d.y;
            },
            x : padding
        })
        .style({
            fill : function(d)
            {
                return d.colour
            }
        });


    svg.selectAll("text")
           .data(data)
           .enter()
           .append("text")
           .text(function(d,i) {
                return d.label + Humanize.fileSize(totVal[i]);
           })
           .attr("text-anchor", "middle")
           .attr("x", chartWidth / 2 + padding)
           .attr("y", function(d) {
                return d.y + 15;
           })
           .attr("font-family", "sans-serif")
           .attr("font-size", "10px")
           .attr("fill", "white");

    var yScale = d3.scale.linear()
            .domain([(diskSpaceLeft + dbSize)/(1024*1024*1024), 0])
            .range([0, chartHeight]);

    var yAxis = d3.svg.axis()
        .scale(yScale)
        .orient("right");

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate("+padding/2+",0)")
        .call(yAxis);

    svg.append("text")
        .attr("text-anchor", "middle")  // this makes it easy to centre the text as the transform is applied to the anchor
        .attr("transform", "translate("+ (padding/4) +","+(chartHeight/2)+")rotate(-90)")  // text is drawn off the screen top left, move down and out and rotate
        .attr("font-size", "11px")
        .text("Size in GB");
}


// Return the color that match the specific speed based on a maximum speed and color scale
//### speed - actual speed
//### maxSpeed - maximum speed
function getColorCategory(speed, maxSpeed)
{
    if(speedScale == "default")
    {
        // use logarithmic scale and start with 1 to avoid negative number
        if (speed < 1)
            speed = 1;
        if (maxSpeed < 1)
            maxSpeed = 1;

        var valueLog = Math.log(speed);
        var maxLog = Math.log(maxSpeed);

        //// avoid division by 0
        if (valueLog == 0)
            return colorScheme[0];
        else if (valueLog == maxLog)
            return colorScheme[colorScheme.length - 1];
        else
            return colorScheme[Math.floor((valueLog / maxLog) * (colorScheme.length))];
    }
    else if(speedScale == "3categories")
    {
        var speedInKmph = speed * 3.6;

        if(speedInKmph < walkingSpeed)
            return colorScheme[0];
        else if(speedInKmph < 80)
            return colorScheme[1];
        else
            return colorScheme[2];

    }
    else if(speedScale == "walking")
    {
        var speedInKmph = speed * 3.6;

        if(speedInKmph == 0)
            return colorScheme[0];
        else if(speedInKmph > walkingSpeed)         //we put all the higher speed in the same category
            return colorScheme[colorScheme.length-1];
        else        // n categories - 1 are left for the speeds between 1 and walkingSpeed.
            return colorScheme[Math.floor((speedInKmph/walkingSpeed)*(colorScheme.length-1))];
    }


}


//Set the prediction control and get a first prediction of when the database will be full
function initPrediction()
{
    d3.select("#predictionDB").selectAll("input")
        // set time interval
        .on("change",function()
        {
            //console.log(this.id);
            predictionDB(this.id);
        });

    // get default prediction
    predictionDB()
}

// Predict when the db will be full based on an interval of time
//### interval - Interval use for the prediction
function predictionDB(interval)
{
    var minutes;

    switch(interval)
    {
        case "30 minutes":
            minutes = 30;
            break;
        case "8 hours":
            minutes = 8 * 60;
            break;
        case "1 day":
            minutes = 24 * 60;
            break;
        case "3 days":
            minutes = 3 * 24 * 60;
            break;
        default:
            interval = "1 week";
            minutes = 7 * 24 * 60;
    }

    var query = encodeQueryData({'minutes': minutes});

    d3.json(host + "countSince?" + query, function(error, json)
    {
        if (error)
            return console.warn(error);


        if(json.countSince != 0)
        {
            var measurementsByMinutes = json.countSince / minutes;
                                         //avg size required for each measure (including index and sensor)
            var sizeByMinutes = measurementsByMinutes * (dbSize/json.countTot);

            var minutesUntilFull = diskSpaceLeft/sizeByMinutes;


            var formatTime = d3.time.format("%d %b %Y - %H:%M");


            var dateFull = new Date(new Date().getTime() + (minutesUntilFull*60*1000));

            d3.select("#predictionDB")
                .select("#predictionResult")
                .text("During the last "+ interval + ", " + json.countSince + " measurements were made. At this pace, the disk will be full the " + formatTime(dateFull) + " (" + humanizeMinutes(minutesUntilFull) + ")");
        }
        else
        {
            d3.select("#predictionDB")
                .select("#predictionResult")
                .text("Error, No measurements during the last "+ interval + " !");
        }

    });
}


// Format minutes into days, hours, minutes
//### minutes - the number of minutes that need to be formatted
function humanizeMinutes(minutes)
{
    var weeks = Math.floor(minutes/(7*24*60));
    var reminderWeek = minutes % (7*24*60);

    var days = Math.floor(reminderWeek / (24*60));
    var reminderDay = reminderWeek % (60*24);

    var hour = Math.floor(reminderDay / 60);
    var reminderHour = reminderDay % 60;

    var stringReturned = "";

    if(weeks > 0)
        stringReturned += weeks + " weeks, ";
    if(days > 0)
        stringReturned += days + " days, ";
    if(hour > 0)
        stringReturned += hour + " hours, ";

    stringReturned += Math.floor(reminderHour) + " minutes";

    return stringReturned;
}


// Set the control of resolution, corresponding to the size of the cells for the grid aggregation
function initSquareSize()
{
    d3.select("#squareSizeSelector").selectAll("input")
    // set time interval
    .on("change",function()
    {
        switch(this.id)
        {
            case "small":
                squareNbHeight = 30;
                break;
            case "medium":
                squareNbHeight = 15;
                break;
            case "large":
                squareNbHeight = 7;
                break;
        }
        squareSizeInPixel = divMapHeight/squareNbHeight;

        refreshCircles();
        refreshArrows();
    });
}


// Define action when selecting a speed color scale in the controls
function initColorScale()
{
    d3.select("#colorScaleSelector").selectAll("input")
    // set time interval
    .on("change",function()
    {
        //console.log(this.id);
        switch(this.id)
        {
            case "default":
                colorScheme = defaultColorScheme;
                speedScale = "default";
                break;
            case "3categories":
                colorScheme = simpleColorScheme;
                speedScale = "3categories";
                break;
            case "walking":
                colorScheme = defaultColorScheme;
                speedScale = "walking";
                break;
        }
        refreshCircles();
    });
}

// Refresh all elements
//### except - Omit to refresh one of the controls, the one that is actually used.
//             (For example when selecting a range of speed, you don't need to refresh the speed histograms, only the others elements)
function refreshAll(except)
{
    // Refresh thoses three visualization
    refreshCircles();
    refreshArrows();
    refreshPaths();

    if(except != "exceptDate")
        displayDateRangeSlider();

    if(except != "exceptSpeed")
        displaySpeedRangeSlider();

    if(except != "exceptSensor")
        show_sensorBarchart();
}

// Remove the previous circles and draw the new circles if the corresponding checkbox is checked
function refreshCircles()
{
    // Remove preceding circles
    d3.select("#mapid").selectAll("#circles").remove();

    // Remove the legend
    d3.selectAll(".circleLegend").remove();


    if(d3.selectAll(".control").select("#circlesControl").property("checked"))
    {
        // Draw new circles
        show_circles();
    }
}

// Remove the previous arrows and draw the new arrows if the corresponding checkbox is checked
function refreshArrows()
{
    // Remove preceding arrows
    d3.select("#mapid").selectAll("#arrows").remove();
    d3.select("#mapid").selectAll("#triangle").remove();

    // Remove the legend
    d3.selectAll(".arrowLegend").remove();

    if(d3.selectAll(".control").select("#arrowsControl").property("checked"))
    {
        // Draw new arrows
        show_arrows();
    }
}

// Remove the previous path and draw the new paths if the corresponding checkbox is checked
function refreshPaths()
{
    d3.select("#pathSelection").html("");

    // Remove the points for each measurements
    d3.select("#mapid").selectAll("#GPSPaths").remove();

    // Remove the path itself
    d3.select("#mapid").select(".leaflet-overlay-pane").selectAll(".leaflet-clickable").remove();

    if (d3.selectAll(".control").select("#GPSPathsControl").property("checked"))
        show_GPSPaths();
    else
        //unselect sensor
        idSensorSelected = "";
}

// Display a legend for the bubble map visualization
//### maxSpeed - Maximum speed amongst average speed by area
//### maxCount - Highest number of measurements in an area
function drawLegendCircles(maxSpeed, maxCount)
{
    //--- Draw the colors legend
    // Inspired by
    // http://leafletjs.com/examples/choropleth.html - Custom Legend Control

    var legendColor = L.control({position: 'bottomright'});

    // Compute the values between each color categories
    var categoryValues = [];

    categoryValues[0] = 0;

    if(speedScale == "default")
    {
        for (var i = 1; i <= colorScheme.length; i++)
        {                                                           // m/s to km/h
            categoryValues.push(Math.pow(maxSpeed, i / colorScheme.length) * 3.6);
        }
    }
    else if(speedScale == "3categories")
    {
        categoryValues[1] = walkingSpeed;
        categoryValues[2] = 80;
    }
    else if(speedScale = "walking")
    {
         for (var i = 1; i < colorScheme.length; i++)
        {
            categoryValues.push(walkingSpeed/(colorScheme.length-1) * i);
        }
    }

    legendColor.onAdd = function (myMap)
    {

        var div = L.DomUtil.create('div', 'info legend circleLegend');

        div.innerHTML += "Speed (km/h)<br>";

        // loop through our density intervals and generate a label with a colored square for each interval
        for (var i = 0; i < colorScheme.length; i++)
        {
            div.innerHTML +=
                    '<i style="background:' + colorScheme[i] + '"></i>' + Humanize.formatNumber(categoryValues[i]) + (categoryValues[i + 1] ? '&ndash;' + Humanize.formatNumber(categoryValues[i + 1]) + '<br>' : '+');
        }

        return div;
    };

    legendColor.addTo(myMap);


    //--- Add a legend for the biggest circles on the map

    var legendBiggerCircleSize = L.control({position: 'bottomright'});

    legendBiggerCircleSize.onAdd = function (myMap)
    {

        var div = L.DomUtil.create('div', 'info legend circleLegend');

        var minSizeLegend = 54;
        var legendSize = squareSizeInPixel*1.2;
        var padding = 10;

        if(legendSize < minSizeLegend)
            legendSize = minSizeLegend;

        div.innerHTML +=
            '<svg height="'+ (legendSize + padding) + 'px" width="'+ legendSize + 'px">' +
                '<circle r="'+ squareSizeInPixel/2 +'" transform="translate(' + legendSize/2 + ',' + legendSize/2 + ')" style="stroke: black; fill-opacity: 0"></circle>' +
                '<text y="' + (legendSize + padding) + '" fill="black"><tspan x="' + legendSize/2 + '" text-anchor="middle" font-size="14">' + Humanize.compactInteger(maxCount) + '</tspan></text>' +
            '</svg>';

        return div;
    };

    legendBiggerCircleSize.addTo(myMap);

    //--- Add a legend for the smallest circles on the map

    var legendSmallestCircleSize = L.control({position: 'bottomright'});

    legendSmallestCircleSize.onAdd = function (myMap)
    {

        var div = L.DomUtil.create('div', 'info legend circleLegend');

        var minSizeLegend = 54;
        var legendSize = minSizeLegend;
        var padding = 10;

        var minSizeCircle = 3;

        var valForMinSize = (minSizeCircle * maxCount)  / (squareSizeInPixel/2);

        div.innerHTML +=
            '<svg height="'+ (legendSize + padding) + 'px" width="'+ legendSize + 'px">' +
                '<circle r="'+ 3 +'" transform="translate(' + legendSize/2 + ',' + legendSize/2 + ')" style="stroke: black; fill-opacity: 0"></circle>' +
                '<text y="' + (legendSize + padding) + '" fill="black"><tspan x="' + legendSize/2 + '" text-anchor="middle" font-size="14">' + "< " + Humanize.compactInteger(valForMinSize) + '</tspan></text>' +
            '</svg>';

        return div;
    };

    legendSmallestCircleSize.addTo(myMap);
}


// Add the legend for the arrows
//### maxSpeed - Maximum speed among the arrows
function drawLegendArrows(maxSpeed)
{
    var legendColor = L.control({position: 'bottomright'});

    var legendSize = 70;

    legendColor.onAdd = function (myMap)
    {

        var div = L.DomUtil.create('div', 'info legend arrowLegend');

        div.innerHTML +=
            '<svg height="'+ (legendSize/2) +'px" width="'+ legendSize + 'px">' +
            '<line x1="' + ((legendSize/2) - (squareSizeInPixel/4)) + '" x2="' + ((legendSize/2)  + (squareSizeInPixel/4))  + '" y1="10" y2="10" marker-end="url(#triangle)"    style="stroke:black;"></line>' +         //m/s -> km/h
            '<text y="30" fill="black"><tspan x="' + legendSize/2 + '" text-anchor="middle" font-size="14">' + Humanize.compactInteger(maxSpeed*3.6) + ' km/h</tspan></text>' +
            '</svg>';

        return div;
    };

    legendColor.addTo(myMap);
}


// Display the speed slider
function displaySpeedRangeSlider()
{
    dataLoading("Speed Range Slider");

    //Check if total data have been loaded before
    loadSpeedTotalData(function()
    {
        var dataJsonTotalSpeed = JSON.parse(tmpJsonTotalSpeed);

        datasetTotalSpeed = dataJsonTotalSpeed.measurementsBySpeedTotal;

        // Depending on the mongoDB version, the json might vary
        if(datasetTotalSpeed.hasOwnProperty('result'))
            datasetTotalSpeed = datasetTotalSpeed.result;

        var query = encodeQueryData({'minLat': minLat, 'maxLat': maxLat, 'minLon': minLon, 'maxLon': maxLon, 'tMin': tMin, 'tMax': tMax, 'sensorType': sensorType, 'speedMin': speedMin, 'speedMax': speedMax});

        // Access the "REST" API.
        d3.json(host + "measurementsBySpeed?" + query, function (error, json)
        {
            if (error)
                return console.warn(error);

            d3.select("#chart-line-hitsperspeed").html("");

            var dataJson = JSON.parse(json);

            var datasetSpeed = dataJson.measurementsBySpeed;

            // Depending on the mongoDB version, the json might vary
            if(datasetSpeed.hasOwnProperty('result'))
                datasetSpeed = datasetSpeed.result;

            if (datasetTotalSpeed.length != 0)
            {
                barChartSpeed = dc.barChart("#chart-line-hitsperspeed");

                var ndx = crossfilter(datasetTotalSpeed);

                // Iterate over the dataset that contains all data
                // Merge it with the dataset that contains selected data
                datasetTotalSpeed.forEach(function (d)
                {
                    // alias
                    d.speed = d._id.speedGroup;

                    datasetSpeed.forEach(function (a)
                    {
                        if (a._id.speedGroup === d._id.speedGroup)
                            d.countSelected = a.count;
                    });

                    // Depending on the mongoDB version, the json might vary
                    if (!d.hasOwnProperty("countSelected"))
                        d.countSelected = 0;

                    d.countExcluded = d.countTotal - d.countSelected;

                });

                var speedDim = ndx.dimension(function (d) {
                    return d.speed;
                });

                var countSelectedBySpeed = speedDim.group().reduceSum(function (d) {
                    return d.countSelected;
                });

                var countTotalByDay = speedDim.group().reduceSum(function (d) {
                    return d.countExcluded;
                    //return d.countTotal;
                });

                // todo : changer ce code, pour gérer le fait qu'avec l'autozoom on reload donc on charge deux fois cette fonction
                if (firstTime < 2) {
                    minSpeedD = speedDim.bottom(1)[0].speed;
                }

                barChartSpeed
                    .height(100)
                    .dimension(speedDim)
                    //.group(countTotalByDay)
                    .group(countSelectedBySpeed)
                    //.stack(countTotalByDay)
                    //.x(d3.scale.log().domain([1, 180]))
                    .x(d3.scale.linear().domain([speedDim.bottom(1)[0].speed, 160]))
                    .xUnits(function ()
                    {
                        return 160;
                    })
                    //.filter(dc.filters.RangedFilter(minDateD, maxDateD))
                    .margins({top: 10, right: 10, bottom: 20, left: 60})
                    .ordinalColors([selectionColor])
                     //.ordinalColors([selectionColor, exclusionColor])       //define barchart
                    .yAxis().ticks(2);

                barChartSpeed.xAxis().ticks(36);

                //// if we memorized a previous position, restored it. Otherwise, filter has default position
                if (tmpStartSpeed != null && tmpEndSpeed != null)
                    barChartSpeed.filter(dc.filters.RangedFilter(tmpStartSpeed, tmpEndSpeed));

                dc.renderAll();

                var brush = barChartSpeed.brush();

                brush.on('brushend.foo', function ()  //namespace to avoid overwriting existing method
                {
                    d3.select("#selectSpeed").property('checked', true);

                    var speedBounds = barChartSpeed.filters()[0];
                    var startSpeed = speedBounds[0];
                    var endSpeed = speedBounds[1];

                    tmpStartSpeed = startSpeed;
                    tmpEndSpeed = endSpeed;

                    speedMin = startSpeed;
                    speedMax = endSpeed;

                    //// memorize previous data
                    //tMinTmp = tMin;
                    refresh("speed");

                    //console.log("Speed Slider changed to " + speedMin + " to " + speedMax);
                });

            }

            checkIfDataLoaded("Speed Range Slider");
        });

    });
}


// Load the speed aggregation for the entire dataset
function loadSpeedTotalData(callback)
{
    if(!speedTotalDataLoaded)
    {
        var query = encodeQueryData({'tMin': tMin, 'tMax': tMax});

        // Access the "REST" API.
        d3.json(host + "measurementsBySpeedTotal?" + query, function (error, jsonTotal)
        {
            if (error)
                return console.warn(error);

            tmpJsonTotalSpeed = jsonTotal;
            speedTotalDataLoaded = true;

            callback();
        });
    }
    else
        callback();
}


// Generate a string of HTTP parameters from a dictionnary
// source : http://stackoverflow.com/questions/111529/create-query-parameters-in-javascript
//### data - Array containing query parameters and values
function encodeQueryData(data)
{
   var ret = [];

   for (var d in data)
   {
        if (data.hasOwnProperty(d))
            ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(data[d]));
   }

   return ret.join("&");
}


// Add controls and Title on the map
function addControls()
{
    //-- Add the controls for the path visualization
    var commandPath = L.control({position: 'bottomleft'});

    commandPath.onAdd = function (myMap)
    {
        var div = L.DomUtil.create('div', 'info legend control');

        div.innerHTML =
            '<input id="GPSPathsControl" type="checkbox" name="showPath"> Paths  <span id="pathSelection"></span>'+
            '<br><div id = "lastData">' +
                '<input id="notLast" type="radio" name="last" checked="checked" ><label for="notLast">default</label>' +
                '<input id="5" type="radio" name="last"><label for="5">5 min</label>' +
                '<input id="10" type="radio" name="last"><label for="10">10 min</label>' +
                '<input id="30" type="radio" name="last"><label for="30">30 min</label>' +
                '<input id="60" type="radio" name="last"><label for="60">1 h</label>' +
                '<input id="720" type="radio" name="last"><label for="720">12 h</label>' +
            '</div>';

        return div;
    };

    commandPath.addTo(myMap);

    //--- Add the controls for the visualization methods
    var command = L.control({position: 'bottomleft'});

    command.onAdd = function (myMap)
    {
        var div = L.DomUtil.create('div', 'info legend control');

        div.innerHTML =
            '<input id="circlesControl" type="checkbox" name="showCircles"> Circles<br>' +
            '<input id="arrowsControl" type="checkbox" name="showArrows"> Arrows<br>' +
                'Resolution :<br>' +
            '<span id="squareSizeSelector"><input id="small" type="radio" name="squareSize"><label for="small">high</label><input id="medium" type="radio" name="squareSize" checked="checked"><label for="medium">medium</label><input id="large" type="radio" name="squareSize"><label for="large">low</label></span><br>' +
                'Speed color scale :<br>' +
            '<span id="colorScaleSelector"><input id="default" type="radio" name="colorScale" checked="checked"><label for="default">all</label><input id="3categories" type="radio" name="colorScale"><label for="3categories">0 | 20 | 80</label><input id="walking" type="radio" name="colorScale"><label for="walking">< 20</label></span>';

        return div;

    };

    command.addTo(myMap);

    //--- Add a button to recenter the map
    var commandResetMap = L.control({position: 'bottomleft'});

    commandResetMap.onAdd = function (myMap)
    {
        var div = L.DomUtil.create('div', 'info legend control');

        div.innerHTML = '<button id="resetMap" type="button">Recenter the map</button>';

        return div;

    };

    commandResetMap.addTo(myMap);


    //--- Add a title to the map
    var mapTitle = L.control({position: 'topright'});

    mapTitle.onAdd = function (myMap)
    {
        var div = L.DomUtil.create('div', 'info legend mapTitle');

        div.innerHTML = 'Location data of event participants: density, speed and individual paths';

        return div;

    };

    mapTitle.addTo(myMap);


    //--- Configure controls actions
    d3.selectAll("[type=checkbox]").on("change", function()
    {
        if(this.id == "heatmapControl")
            show_heatmap();

        // Refresh only what is selected or unselected
        refresh(this.id);
    });

    d3.select("#resetMap").on("click", function()
    {
        //console.log("Recenter map button");

        // Recenter the map to Switzerland
        myMap.setView(new L.LatLng(46.801111, 8.226667), 8);

        // Inform that the map is resetting
        mapReset = true;

        //Reinitialize the border of the map
        minLat = mapBounds._southWest.lat;
        minLon = mapBounds._southWest.lng;
        maxLat = mapBounds._northEast.lat;
        maxLon = mapBounds._northEast.lng;

        // Zoom the map on the actual data selected through the crossfilter
        defineMapBounds();
    });
}

// disable and enable all interactions with map
// source : http://gis.stackexchange.com/questions/54454/disable-leaflet-interaction-temporary
//### map - Map that need to be disabled
function disableInteraction(map)
{
    //map.zoomControl.disable();
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();

    d3.select("#mapid").selectAll(".control").selectAll("input").attr("disabled", "disabled");
    d3.select("#mapid").select(".leaflet-control-zoom").selectAll("a").style({"color": "#bbb", "pointer-events": "none"});
}

//### map - Map that need to be enabled
function enableInteraction(map)
{
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();

    d3.select("#mapid").selectAll(".control").selectAll("input").attr("disabled", null);
    d3.select("#mapid").select(".leaflet-control-zoom").selectAll("a").style({"color": "black", "pointer-events": "auto"});
}

// Obtain the new map bounds
function getNewBounds()
{
    // Map bounds each time the user interact with the map

    var mapBounds = secondMap.getBounds();
    minLatSecond = mapBounds._southWest.lat;
    minLonSecond = mapBounds._southWest.lng;
    maxLatSecond = mapBounds._northEast.lat;
    maxLonSecond = mapBounds._northEast.lng;
}


// Add controls on the second map
function addControlSecondMap()
{
    var commandHeatmap = L.control({position: 'bottomleft'});

    commandHeatmap.onAdd = function (secondMap)
    {
        var div = L.DomUtil.create('div', 'info legend control heatmap');

        div.innerHTML =  '<input id="heatmapControl" type="checkbox" name="showHeatmap">Heatmap live updates   ' +
                '<input id="5heatmap" type="radio" name="heatmapInterval" checked="checked"><label for="5heatmap">5 min</label>' +
                '<input id="10heatmap" type="radio" name="heatmapInterval"><label for="10heatmap">10 min</label>' +
                '<input id="30heatmap" type="radio" name="heatmapInterval"><label for="30heatmap">30 min</label>';

        return div;

    };

    commandHeatmap.addTo(secondMap);


    // Add info about heatmap

    var infoHeatmap = L.control({position: 'topright'});

    infoHeatmap.onAdd = function (secondMap)
    {
        var div = L.DomUtil.create('div', 'info legend control heatmap');

        div.innerHTML = '<button id="enlargeSecondMap" type="button">Click to change the size</button>';

        return div;

    };

    infoHeatmap.addTo(secondMap);
}

// Display a heatmap on the second map and refresh it every 5 seconds while it is enabled.
function show_heatmap()
{
    var query = encodeQueryData({'minLat': minLatSecond, 'maxLat': maxLatSecond, 'minLon': minLonSecond, 'maxLon': maxLonSecond, 'minutesInterval': minutesInterval});

    d3.json(host + "getAllCoordinates?" + query, function (error, json) {
        if (error)
            return console.warn(error);

        if(typeof heat != 'undefined')
            secondMap.removeLayer(heat);

        var arrayCoordinates = JSON.parse(json);

        var coordinates = [];

        var intensity;

        if(coordinates.length > 1000)
            intensity = 250/coordinates.length;
        else
            intensity = 1;

        arrayCoordinates.forEach(function (d)
        {
            coordinates.push([d.nodeLoc.coordinates[1], d.nodeLoc.coordinates[0], intensity]);
        });

        //console.log(coordinates.length);

        heat = L.heatLayer(coordinates, {radius: 15}).addTo(secondMap);

        //refresh each 5 seconds
        if(d3.select("#secondMap").selectAll(".control").select("#heatmapControl").property("checked"))
            setTimeout(show_heatmap, 5000);
    });
}

// Draw the selected path
function selectSensor(latLng)
{
    dataLoading("selectSensor");

    var query = encodeQueryData({'lat': latLng.lat, 'lon': latLng.lng, 'minLat': minLat, 'maxLat': maxLat, 'minLon': minLon, 'maxLon': maxLon, 'tMin': tMin, 'tMax': tMax, 'speedMin': speedMin, 'speedMax': speedMax});

    d3.json(host + "getSensorFromCoordinates?" + query, function(error, json) {
        if (error)
            return console.warn(error);

        var result = JSON.parse(json);

        var GPSArray = result.GPSData;

        idSensorSelected = result.idSensor;

        // Remove the other paths
        d3.select("#mapid").selectAll("#GPSPaths").remove();
        d3.select("#mapid").select(".leaflet-overlay-pane").selectAll(".leaflet-clickable").remove();

        // Draw the selected path
        drawPath(GPSArray);

        checkIfDataLoaded("selectSensor");
    });
}

// Draw a path from a sensor
//### GPSArray - The GPS coordinates from a sensor
function drawPath(GPSArray)
{
    var svg = d3.select("#mapid").select("svg");

    var linePoints = [];
    var arrayPath = [];
    var arrayBearing = [];
    var layers = [];
    var latLngA;
    var latLngB;

    var lines;

    // Generate a random color for the device and draw the path
    //http://stackoverflow.com/questions/1484506/random-color-generator-in-javascript
    var myColor;

    if(idSensorSelected == "")
        myColor = '#'+(Math.random()*0xFFFFFF<<0).toString(16);
    else
    {
        myColor = selectionColor;

        d3.select("#pathSelection").html('<button id="unselectPath" type="button">Unselect a path</button>');

        // add action when unselecting path
        d3.select("#unselectPath").on("click", function()
        {
            //console.log("Unselect Path");

            idSensorSelected = "";
            refreshPaths();
        });
    }


    // Construct a path with each measurements obtained by this device
    for (var j = 0; j < GPSArray.length; j++)
    {
        if(j > 0)
        {
            latLngA = L.latLng(GPSArray[j - 1].nodeLoc.coordinates[1], GPSArray[j - 1].nodeLoc.coordinates[0]);
            latLngB = L.latLng(GPSArray[j].nodeLoc.coordinates[1], GPSArray[j].nodeLoc.coordinates[0]);

            // if there is a gap between two measurements we interrupt the path and continue from the next point
            // A gap can be an interval of time ( > 10 sec) or a distance ( > 30m)
            if ((GPSArray[j - 1].t.$date - GPSArray[j].t.$date > 10000) || latLngA.distanceTo(latLngB) > 25)
            {
                //draw the partial path
                lines = L.polyline(linePoints, {id: "GPSPaths", color: myColor, opacity: 1})//.addTo(myMap);
                layers.push(lines);


                arrayPath = arrayPath.concat(lines._latlngs);

                // reset value for the next partial path
                linePoints = [];
                lines = null;
            }
        }

        // add the point to the partial path
        linePoints.push(L.latLng(GPSArray[j].nodeLoc.coordinates[1], GPSArray[j].nodeLoc.coordinates[0]));;

        // keep track of the bearing
        arrayBearing.push(GPSArray[j].bearing);
    }

    // draw the last part of the path (or the complete path if there is no gap)
    lines = L.polyline(linePoints, {id: "GPSPaths", color: myColor, opacity: 1});
    layers.push(lines);

    // group each layers from partials paths into one layer group
    var featureGroup = L.featureGroup(layers).addTo(myMap);

    featureGroup.on('click', function(e)
    {
        //console.log(e);
        selectSensor(e.layer._latlngs[0]);
    });

    arrayPath = arrayPath.concat(lines._latlngs);

    // Draw a square for each measurements that have been made
    var g = svg.append("g").attr("id", "GPSPaths");
    var myColorDarker = shadeColor(myColor, 0.4);

    g.selectAll("polygon")
        .data(arrayPath)
        .enter().append("polygon")
        .style("stroke", myColorDarker)
        .style("fill", myColorDarker)
        .style("pointer-events", "none") //allow to click through
        .attr("points", function(d,i){
           if(arrayBearing[i] == 0 || arrayBearing[i] == -1)
           {
               return (myMap.latLngToLayerPoint(d).x - 2) + ","+ (myMap.latLngToLayerPoint(d).y - 2) + " " +
                   (myMap.latLngToLayerPoint(d).x - 2) + ","+ (myMap.latLngToLayerPoint(d).y + 2) + " " +
                   (myMap.latLngToLayerPoint(d).x + 2) + ","+ (myMap.latLngToLayerPoint(d).y + 2) + " " +
                   (myMap.latLngToLayerPoint(d).x + 2) + ","+ (myMap.latLngToLayerPoint(d).y - 2)
           }
           return myMap.latLngToLayerPoint(d).x + "," + (myMap.latLngToLayerPoint(d).y - 2) + " " +
               myMap.latLngToLayerPoint(d).x + "," + (myMap.latLngToLayerPoint(d).y + 2) + " " +
               (myMap.latLngToLayerPoint(d).x+6) + "," + myMap.latLngToLayerPoint(d).y;})
           .attr("transform",
            function (d,i) {
                var rotation;
                if(arrayBearing[i] == 0 || arrayBearing[i] == -1)
                    rotation = 0;
                else
                    rotation = arrayBearing[i]-90;
            return "rotate(" +
                rotation + "," +
                myMap.latLngToLayerPoint(d).x + "," +
                myMap.latLngToLayerPoint(d).y + ")";
            }
        )
        .append("title")                                                                                         //km/h
        .text(function (d,i) {
            return "Coordonnées: " + d + "," + arrayBearing[i];
        });
}

// Set the controls to choose a time interval for the heatmap
function initHeatmapInterval()
{
    d3.select(".heatmap").selectAll("[type=radio]")
        .on("click", function ()
        {
            if(this.id == "5heatmap")
                minutesInterval = 5;
            else if(this.id == "10heatmap")
                minutesInterval = 10;
            else if(this.id == "30heatmap")
                minutesInterval = 30;

            refresh("heatmap");
        });
}