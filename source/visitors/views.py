# /*
#  -----------------------------------------------------------------------------------
#  File     : views.py
#  Author   : Rouiller Bastien
#  Date     : 29.07.2016
#
#  Goal     : Implement the REST API and redirect the operations user to the correct homepage when accessing the console
#  -----------------------------------------------------------------------------------
# */


from django.shortcuts import render
from django.http import JsonResponse
from django.http import HttpResponse
from pymongo import MongoClient
from bson.json_util import dumps
from bson.objectid import ObjectId
from datetime import timedelta, datetime
from django.views.decorators.csrf import csrf_exempt

import time
import json
import re
import pymongo

import ctypes
import os
import platform


# Return the console web page when accessing /visitors
def index(request):

    return render(request, 'visitors/index.html')


# Return the quantity of GPS data for each square
def countsBySquare(request):

    start_time = time.time()

    # Connect to the DB using the measurements collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameteres
    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    ratioLonLat = float(request.GET.get('ratioLonLat', 1))
    sensorType = request.GET.get('sensorType', '')
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    squareNbHeight = int(request.GET.get('squareNbHeight', 15))
    speedMin = float(request.GET.get('speedMin', -1))
    speedMax = float(request.GET.get('speedMax', 160))

    # Km/h to m/s

    # -1 is not an actual measurement, it means the speed measure is not available.
    if speedMin != -1:
        speedMin = speedMin / 3.6

    speedMax = speedMax / 3.6

    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)


    latTot = maxLat - minLat

    # For the same number of pixels we don't get the same quantity of Lon/Lat
    squareSizeLat = latTot/squareNbHeight
    squareSizeLon = squareSizeLat * ratioLonLat


    if sensorType == "" or sensorType == "all":
        regxSensorType = re.compile("", re.IGNORECASE)
    else:
        regxSensorType = re.compile(re.escape(sensorType), re.IGNORECASE)


    # Aggregation by area and count the quantity of measurements, using the filters selected by the operations engineer
    cursor = GPSData.aggregate(
        [
            {
                "$match":   # excluded non-valid timestamp
                    {       #http://stackoverflow.com/questions/28415995/exception-cant-convert-from-bson-type-eoo-to-date
                        "$and": [{"t": {"$type": 9}, "nodeLoc.coordinates.0": {"$type": 1}, "nodeLoc.coordinates.1": {"$type": 1}}, {"t": {"$gt": tMin, "$lt": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "name": regxSensorType, "speed": {"$gte": speedMin, "$lte": speedMax}}]
                    }
            },
            {
                "$group":
                {
                    "_id":      # id is mandatory, we use coordinate for id
                    {
                        "latGroup": {"$subtract": [{"$arrayElemAt": [ "$nodeLoc.coordinates", 1]}, {"$mod": [{"$arrayElemAt": ["$nodeLoc.coordinates", 1]}, squareSizeLat]}]},
                        "lonGroup": {"$subtract": [{"$arrayElemAt": [ "$nodeLoc.coordinates", 0]}, {"$mod": [{"$arrayElemAt": ["$nodeLoc.coordinates", 0]}, squareSizeLon]}]},
                    },
                    "count": {"$sum": 1},
                    "avgSpeed": {"$avg":  {"$cond": [{"$eq": ["$speed", -1]}, "null", "$speed"]}}  #if speed equals 1, we ignore it in the average
                }
            }
        ]
    )

    # convert BSON(query results) to JSON
    myDump = dumps(cursor)

    # Add information to the dump
    myDump = '{"squareSizeLat" :' + str(squareSizeLat) + ', "squareSizeLon":' + str(squareSizeLon) + ', "items":' + myDump + "}"

    print("countsBySquare returned a dump of ", len(myDump), " characters")
    print("countsBySquare took %s seconds to load" % (time.time() - start_time))

    # Return Json HTTP Response
    return JsonResponse(myDump, safe=False)


# Return an array containing an aggregation of the speed by area
def directionsBySquare(request):

    # Connect to the DB using the measurements collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameteres
    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    ratioLonLat = float(request.GET.get('ratioLonLat', 1))
    sensorType = request.GET.get('sensorType', '')
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    squareNbHeight = int(request.GET.get('squareNbHeight', 15))
    speedMin = float(request.GET.get('speedMin', -1))
    speedMax = float(request.GET.get('speedMax', 160))

    # Km/h to m/s
    if speedMin != -1:
        speedMin = speedMin / 3.6

    speedMax = speedMax / 3.6

    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)


    latTot = maxLat - minLat

    # For the same number of pixels we don't get the same quantity of Lon/Lat
    squareSizeLat = latTot/squareNbHeight
    squareSizeLon = squareSizeLat * ratioLonLat

    if sensorType == "" or sensorType == "all":
        regxSensorType = re.compile("", re.IGNORECASE)
    else:
        regxSensorType = re.compile(re.escape(sensorType), re.IGNORECASE)

    # Aggregation by area and returned the average speed and bearing , using the filters selected by the operations engineer
    cursor = GPSData.aggregate(
        [
            {
                "$match":
                    {
                        "$and": [{"t": {"$gt": tMin, "$lt": tMax}, "name": regxSensorType, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "speed": {"$gte": speedMin, "$lte": speedMax}}]
                    }
            },
            {
                "$group":
                {
                    "_id":      # id is mandatory, we use coordinate for id
                    {
                        "latGroup": {"$subtract": [{"$arrayElemAt": [ "$nodeLoc.coordinates", 1]}, {"$mod": [{"$arrayElemAt": [ "$nodeLoc.coordinates", 1]}, squareSizeLat]}]},
                        "lonGroup": {"$subtract": [{"$arrayElemAt": [ "$nodeLoc.coordinates", 0]}, {"$mod": [{"$arrayElemAt": [ "$nodeLoc.coordinates", 0]}, squareSizeLon]}]},
                    },
                    "avgSpeed": {"$avg":  {"$cond": [{"$eq": ["$speed", -1]}, "null", "$speed"]}},  #if speed equals 1, we ignore it in the average
                    "avgBearing": {"$avg":  {"$cond": [{"$eq": ["$bearing", -1]}, "null", "$bearing"]}} #if bearing equals 1, we ignore it in the average
                }
            }
        ]
    )


    # convert BSON(query results) to JSON
    myDump = dumps(cursor)


    # Add information to the dump
    myDump = '{"squareSizeLat" :' + str(squareSizeLat) + ', "squareSizeLon":' + str(squareSizeLon) + ', "items":' + myDump + "}"

    print("directionsBySquare returned a dump of ", len(myDump), " characters")

    # Return Json HTTP Response
    return JsonResponse(myDump, safe=False)


# Get all measurements for each sensor
def paths(request):

    pathLength = 50

    # Connect to the DB using the measurements collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameteres
    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    speedMin = float(request.GET.get('speedMin', -1))
    speedMax = float(request.GET.get('speedMax', 160))

    # Km/h to m/s
    if speedMin != -1:
        speedMin = speedMin / 3.6

    speedMax = speedMax / 3.6

    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)
    sensorType = request.GET.get('sensorType', '')

    if sensorType == "" or sensorType == "all":
        cursor = GPSData.find({"t": {"$gt": tMin, "$lt": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "speed": {"$gte": speedMin, "$lte": speedMax}}).distinct("id")
    else:
        #add sensor
        regxSensorType = re.compile(re.escape(sensorType), re.IGNORECASE)
        cursor = GPSData.find({"t": {"$gt": tMin, "$lt": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "speed": {"$gte": speedMin, "$lte": speedMax},"name": {"$regex": regxSensorType}}).distinct("id")

    myDump = '{"GPSPath":['

    for document in cursor:  #[100:] => last 100 sensor paths
        idSensor = document
        pathData = getPathFor(idSensor, minLat, maxLat, minLon, maxLon, tMin, tMax, speedMin, speedMax)
        # projection
        # pathData = GPSData.find({"id": idSensor, "t": {"$gt": tMin, "$lt": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "speed": {"$gte": speedMin, "$lte": speedMax}}, {"nodeLoc": 1, "_id": 0, "t": 1, "bearing": 1}).sort([("t", -1)])#.limit(pathLength)
        myDump += dumps(pathData) + ','

    myDump += '[]]}'

    print("paths returned a dump of ", len(myDump), " characters")

    return JsonResponse(myDump, safe=False)

# Return all measurements for a specific sensor
def getPathFor(idSensor, minLat, maxLat, minLon, maxLon, tMin, tMax, speedMin, speedMax):

    # Connect to the DB using the sensors collection
    GPSData = connectToDB("msmts")

    pathData = GPSData.find({"id": idSensor, "t": {"$gt": tMin, "$lt": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "speed": {"$gte": speedMin, "$lte": speedMax}}, {"nodeLoc": 1, "_id": 0, "t": 1, "bearing": 1}).sort([("t", -1)])

    return pathData


# Return the path of an individual sensor
def pathFromSensor(request):
    start_time = time.time()

    # Connect to the DB using the sensors collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameters
    idSensor = request.GET.get('idSensor')

    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)

    speedMin = float(request.GET.get('speedMin', -1))
    speedMax = float(request.GET.get('speedMax', 160))


    cursorPath = getPathFor(idSensor, minLat, maxLat, minLon, maxLon, tMin, tMax, speedMin, speedMax)

    myDump = dumps(cursorPath)

    print("pathsFromSensor ", len(myDump), " characters")
    print("pathsFromSensor took %s seconds to load" % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)


# Aggregate the measurements by hour for the selected filters
def measurementsByHour(request):

    start_time = time.time()

    # Connect to the DB using the measurements collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameteres
    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    speedMin = float(request.GET.get('speedMin', -1))
    speedMax = float(request.GET.get('speedMax', 160))

    # Km/h to m/s
    if speedMin != -1:
        speedMin = speedMin / 3.6

    speedMax = speedMax / 3.6

    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)
    sensorType = request.GET.get('sensorType', '')

    epoch = datetime.fromtimestamp(0)

    if sensorType == "" or sensorType == "all":
        regxSensorType = re.compile("", re.IGNORECASE)
    else:
        regxSensorType = re.compile(re.escape(sensorType), re.IGNORECASE)

    # Aggregation by hour, using the filters selected by the operations engineer
    cursor = GPSData.aggregate(
       [
        {
            "$match":
            {
                "t": {"$gt": tMin, "$lt": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "name": regxSensorType, "speed": {"$gte": speedMin, "$lte": speedMax}, "name": regxSensorType
            }
        },
        {
            "$group":
            {
                "_id": {"hourGroup": {"$subtract": ["$t", {"$mod": [{"$subtract": ["$t", epoch]}, 60*60*1000]}]}},
                "count": {"$sum": 1},
            }
        }
       ]
    )

    # convert BSON(query results) to JSON
    myDump = dumps(cursor)

    # Add information to the dump
    myDump = '{"measurementsByHour" :' + myDump + "}"

    print(myDump)

    print("measurementsByHour returned a dump of ", len(myDump), " characters")

    print("MeasurementsByHour took %s seconds to load" % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)


# Return the total number of measurements by hour
def measurementsByHourTotal(request):

    start_time = time.time()

    # Connect to the DB using the measurements collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameters
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')

    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)

    epoch = datetime.fromtimestamp(0)

    # Aggregation by hour of all measurements
    cursor = GPSData.aggregate(
       [
        {
            "$match":
            {
                "t": {"$gt": tMin, "$lt": tMax}
            }
        },
        {
            "$group":
            {
                "_id": {"hourGroup": {"$subtract": ["$t", {"$mod": [{"$subtract": ["$t", epoch]}, 60*60*1000]}]}},
               "countTotal": {"$sum": 1}
            }
        }
       ]
    )

    # convert BSON(query results) to JSON
    myDump = dumps(cursor)

    # Add information to the dump
    myDump = '{"measurementsByHourTotal" :' + myDump + "}"

    print("MeasurementsByHourTotal returned a dump of ", len(myDump), " characters")

    print("MeasurementsByHourTotal took %s seconds to load." % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)


# Return the number of measurement by each km/h
def measurementsBySpeed(request):

    start_time = time.time()

    # Connect to the DB using the sensors collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameteres
    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    #todo: voir si il faut set la zimezone
    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)
    sensorType = request.GET.get('sensorType', '')

    if sensorType == "" or sensorType == "all":
        regxSensorType = re.compile("", re.IGNORECASE)
    else:
        regxSensorType = re.compile(re.escape(sensorType), re.IGNORECASE)

    # Aggregation by speed, using the filters selected by the operations engineer
    cursor = GPSData.aggregate(
       [
        {
            "$match":
            {
                "t": {"$gt": tMin, "$lt": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "name": regxSensorType, "speed": {"$gt": 0, "$lt": 160}
            }
        },
        {
            "$group":
            {
                "_id": {"speedGroup": {"$subtract": [{"$multiply": ["$speed", 3.6]}, {"$mod": [{"$multiply": ["$speed", 3.6]}, 1]}]}},
                "count": {"$sum": 1},
            }
        }
       ]
    )

    myDump = dumps(cursor)

    # Add information to the dump
    myDump = '{"measurementsBySpeed" :' + myDump + "}"

    print("measurementsBySpeed returned a dump of ", len(myDump), " characters")
    print("measurementsBySpeed took %s seconds to load" % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)


# Return the overall number of measurements by speed (in km/h)
def measurementsBySpeedTotal(request):

    start_time = time.time()

    # Connect to the DB using the sensors collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameters
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)

    # Aggregation by speed for all measurements
    cursor = GPSData.aggregate(
       [
        {
            "$match":
            {
                "t": {"$gt": tMin, "$lt": tMax}, "speed": {"$gt": 0, "$lt": 160}
            }
        },
        {
            "$group":
            {
                "_id": {"speedGroup": {"$subtract": [{"$multiply": ["$speed", 3.6]}, {"$mod": [{"$multiply": ["$speed", 3.6]}, 1]}]}},
                "countTotal": {"$sum": 1},
            }
        }
       ]
    )

    myDump = dumps(cursor)

    # Add information to the dump
    myDump = '{"measurementsBySpeedTotal" :' + myDump + "}"

    print("measurementsBySpeedTotal returned a dump of ", len(myDump), " characters")
    print("measurementsBySpeedTotal took %s seconds to load" % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)


# Give all kind of sensor used for coordinate
def sensorCounts(request):

    start_time = time.time()

    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    speedMin = float(request.GET.get('speedMin', -1))
    speedMax = float(request.GET.get('speedMax', 160))

    # Km/h to m/s
    if speedMin != -1:
        speedMin = speedMin / 3.6

    speedMax = speedMax / 3.6

    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')

    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)

    # Connect to the DB using the measurements collection
    GPSData = connectToDB("msmts")

    # List of sensor categories
    tabSensor = ["Android", "iOS"]

    myDump = '{'  #all" :' + tmpDump + ','

    for sensor in tabSensor:
        regxSensor = re.compile(re.escape(sensor))
        cursor = GPSData.find({"t": {"$gt": tMin, "$lt": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "sensorType": sensor, "speed": {"$gte": speedMin, "$lte": speedMax}}).count()

        # Converst bson to json
        tmpDump = dumps(cursor)

        myDump += '"' + sensor + '":' + tmpDump + ','

    # remove last comma
    myDump = myDump[:-1] + '}'

    print("sensorCounts returned a dump of ", len(myDump), " characters")
    print("SensorCounts took %s seconds to load" % (time.time() - start_time))

    # Send a HTTP Json response
    return JsonResponse(myDump, safe=False)

# Return the number of measurements for each sensor according to the filters
def sensorCountsTotal(request):

    start_time = time.time()

    # Connect to the DB using the measurements collection
    GPSData = connectToDB("msmts")

    # List of sensor categories
    tabSensor = ["Android", "iOS"]

    myDump = '{'

    for sensor in tabSensor:
        regxSensor = re.compile(re.escape(sensor))
        cursor = GPSData.find({"sensorType": sensor}).count()

        # Converst bson to json
        tmpDump = dumps(cursor)

        myDump += '"' + sensor + '":' + tmpDump + ','

    # remove last comma
    myDump = myDump[:-1] + '}'

    print("sensorCountsTotal returned a dump of ", len(myDump), " characters")
    print("sensorCountTotal took %s seconds to load" % (time.time() - start_time))

    # Send a HTTP Json response
    return JsonResponse(myDump, safe=False)

# Return the min and max longitude and latitude in order to allow the map to zoom on the actual measurements selected by the user
def mapBounds(request):

    start_time = time.time()

    # Connect to the DB using the measurements collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameteres
    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)
    sensorType = request.GET.get('sensorType', '')
    speedMin = float(request.GET.get('speedMin', -1))
    speedMax = float(request.GET.get('speedMax', 160))

    # Km/h to m/s
    if speedMin != -1:
        speedMin = speedMin / 3.6

    speedMax = speedMax / 3.6

    if sensorType == "" or sensorType == "all":
        regxSensorType = re.compile("", re.IGNORECASE)
    else:
        regxSensorType = re.compile(re.escape(sensorType), re.IGNORECASE)

    #Get the min/max value for the longitude and the latitude for the selected measurements
    cursorMinLat = GPSData.find({"nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "t": {"$gt": tMin, "$lt": tMax}, "speed": {"$gte": speedMin, "$lte": speedMax}, "name": {"$regex": regxSensorType}}).sort("nodeLoc.coordinates.1", pymongo.ASCENDING).limit(1)
    cursorMaxLat = GPSData.find({"nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "t": {"$gt": tMin, "$lt": tMax}, "speed": {"$gte": speedMin, "$lte": speedMax}, "name": {"$regex": regxSensorType}}).sort("nodeLoc.coordinates.1", pymongo.DESCENDING).limit(1)
    cursorMinLon = GPSData.find({"nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "t": {"$gt": tMin, "$lt": tMax}, "speed": {"$gte": speedMin, "$lte": speedMax}, "name": {"$regex": regxSensorType}}).sort("nodeLoc.coordinates.0", pymongo.ASCENDING).limit(1)
    cursorMaxLon = GPSData.find({"nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}, "t": {"$gt": tMin, "$lt": tMax}, "speed": {"$gte": speedMin, "$lte": speedMax}, "name": {"$regex": regxSensorType}}).sort("nodeLoc.coordinates.0", pymongo.DESCENDING).limit(1)


    # Convert the cursor into a list to check if no result. Using count() use to much resources. Use clone otherwise it exhausts the cursor
    if len(list(cursorMinLat.clone())) > 0:
        myDump = '{"bounds" : {' + '"minLat": "' + str(cursorMinLat[0]['nodeLoc']['coordinates'][1]) +'", "maxLat": "' + str(cursorMaxLat[0]['nodeLoc']['coordinates'][1]) +'", "minLon": "' + str(cursorMinLon[0]['nodeLoc']['coordinates'][0]) +'", "maxLon": "' + str(cursorMaxLon[0]['nodeLoc']['coordinates'][0]) + '"}}'
    else:
        myDump = {}

    print("MapBounds returned a dump of ", len(myDump), " characters")
    print("MapBounds took %s seconds to load" % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)



# Return all the coordinates
def getAllCoordinates(request):

    start_time = time.time()

    # Connect to the DB using the sensors collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameters
    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    minutesInterval = int(request.GET.get('minutesInterval', 5))

    # only retrieve measurements made less than 5 seconds ago
    tMin = datetime.today() - timedelta(minutes=minutesInterval)
    tMax = datetime.today()

    cursor = GPSData.find({"t": {"$gte": tMin, "$lte": tMax}, "nodeLoc.coordinates.1":{"$gt":minLat, "$lt": maxLat}, "nodeLoc.coordinates.0": {"$gt": minLon, "$lt": maxLon}}, {"nodeLoc.coordinates": 1, "_id":0})

    # convert BSON(query results) to JSON
    myDump = dumps(cursor)

    print("getAllCoordinates returned a dump of ", len(myDump), " characters")
    print("getAllCoordinates took %s seconds to load" % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)


# Return the sensor from the given coordinates
def getSensorFromCoordinates(request):

    start_time = time.time()

    # Connect to the DB using the sensors collection
    GPSData = connectToDB("msmts")

    # Obtain the URL parameters
    lat = float(request.GET.get('lat'))
    lon = float(request.GET.get('lon'))

    minLat = float(request.GET.get('minLat', 0))
    maxLat = float(request.GET.get('maxLat', 180))
    minLon = float(request.GET.get('minLon', 0))
    maxLon = float(request.GET.get('maxLon', 180))
    tMin = request.GET.get('tMin', 0)
    tMax = request.GET.get('tMax')
    tMin = datetime.fromtimestamp(int(tMin)/1000)
    tMax = datetime.fromtimestamp(int(tMax)/1000)

    speedMin = float(request.GET.get('speedMin', -1))
    speedMax = float(request.GET.get('speedMax', 160))

    cursor = GPSData.find({"nodeLoc.coordinates.1": lat, "nodeLoc.coordinates.0": lon}).distinct("id")

    cursorPath = getPathFor(cursor[0], minLat, maxLat, minLon, maxLon, tMin, tMax, speedMin, speedMax)

    myDump = dumps(cursorPath)

    # Add information to the dump
    myDump = '{"idSensor": "' + cursor[0] + '","GPSData" :' + myDump + "}"

    print("getSensorFromCoordinates returned a dump of ", len(myDump), " characters")
    print("getSensorFromCoordinates took %s seconds to load" % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)


# Return information about the database including  the db size
def statistics(request):

    start_time = time.time()

    # Make a connection through the default MongoDB port
    client = MongoClient()

    # Link to the database
    db = client.copy2

    dbStats = db.command("dbstats")

    dbStats['diskSpaceLeft'] = get_free_space_b()

    myDump = dumps(dbStats)

    print("Statistics took %s seconds to load." % (time.time() - start_time))

    return JsonResponse(myDump, safe=False)


# Returns the total counts of measurements and since the last X minutes
def countSince(request):

    # Connect to the DB using the sensors collection
    GPSData = connectToDB("msmts")

    intervalInMinutes = int(request.GET.get('minutes', 200000))

    tMin = datetime.today() - timedelta(minutes=intervalInMinutes)
    print(tMin)

    countTot = GPSData.find().count()
    countSince = GPSData.find({"t": {"$gt": tMin}}).count()

    counts = {'countTot': countTot, 'countSince': countSince}

    return JsonResponse(counts)


# Get free space on the disk in bytes
# http://stackoverflow.com/questions/51658/cross-platform-space-remaining-on-volume-using-python
def get_free_space_b():
    if platform.system() == 'Windows':
        free_bytes = ctypes.c_ulonglong(0)
        ctypes.windll.kernel32.GetDiskFreeSpaceExW(ctypes.c_wchar_p("C:\\"), None, None, ctypes.pointer(free_bytes))
        return free_bytes.value
    else:
        st = os.statvfs(".")
        return st.f_bavail * st.f_frsize


# Make a connection to the database on a specific collection
def connectToDB(collection):

    # Make a connection through the default MongoDB port
    client = MongoClient()

    # Link to the database
    db = client.copy2

    # Link to the collection GPSData
    GPSData = db[collection]

    return GPSData


#-- The endpoints below are used to create new measurements

# Create a new sensor if doesn't yet exist
def registerSensor(sensor):

    # Connect to the DB using the sensors collection
    sensorData = connectToDB("sensors")

    # use id (UUI) for _id in the DB
    sensor["_id"] = sensor["id"]
    del sensor["id"]

    print(sensor)

    if sensorData.find({'_id': sensor['_id']}).count() > 0:
        sensorData.find_one_and_replace({'_id': sensor['_id']}, sensor)
    else:
        sensorData.insert_one(sensor)


# This endpoints allows to create a measurement
@csrf_exempt
def msmts(request):

    if request.method == 'POST':
        # Parsing POST request body
        body_utf = request.body.decode('utf-8')
        measurement = json.loads(body_utf)

        formatAndSendMeasurement(measurement)

    return HttpResponse(status=201)


# This endpoints allows to create a measurement
@csrf_exempt
def msmts(request):

    if request.method == 'POST':
        # Parsing POST request body
        body_utf = request.body.decode('utf-8')
        measurement = json.loads(body_utf)

        if formatAndSendMeasurement(measurement):

            return HttpResponse(status=201)

        else:

            return HttpResponse(status=403)


# This endpoint allows to create measurements by batch
@csrf_exempt
def msmts_b(request):

    if request.method == 'POST':
        # Parsing POST request body
        body_utf = request.body.decode('utf-8')
        body = json.loads(body_utf)

        print(body)

        tList = body['t']

        measurement = {}

        print(sensor)

        print("sensor : ", body['id'], " exists.")

        # extract each measurement from the batch
        for index, timestamp in enumerate(tList):
            measurement["id"] = body["id"]

            for key in body:
                if key != "id":
                    measurement[key] = (body[key])[index]

            # if sensor doesn't exist we sent an error
            if not formatAndSendMeasurement(measurement):
                return HttpResponse(status=403)

        return HttpResponse(status=201)


# Adapt to the new format of db for GPS Coordinates and timestamp
def formatAndSendMeasurement(measurement):

    sensor = getSensorInfo(measurement['id'])

    # If we get {} sensor doesn't exist
    if sensor:

        # Connect to the DB using the measurements collection
        GPSData = connectToDB("msmts")

        # Add sensor information
        measurement['name'] = sensor['name']

        if "Android" in measurement['name']:
            measurement['sensorType'] = "Android"
        elif "iOS" in measurement['name']:
            measurement['sensorType'] = "iOS"
        else:
            measurement['sensorType'] = "other"

        # Migrate to GeoJSON format
        locLat = measurement['locLat']
        locLon = measurement['locLon']

        del measurement['locLat']
        del measurement['locLon']

        measurement['nodeLoc'] = {"type": "Point", "coordinates": [locLon, locLat]}

        # Migrate from timestamp in number to date format
        t = measurement['t']
        del measurement['t']

        tDate = datetime.fromtimestamp(int(t)/1000)

        measurement['t'] = tDate

        # Manually generate _id field otherwise duplicateKeyError :
        #http://stackoverflow.com/questions/21119928/getting-err-e11000-duplicate-key-error-when-inserting-into-mongo-using-the
        measurement['_id'] = ObjectId()

        print(measurement)

        GPSData.insert_one(measurement)

        return True
    else:
        return False


# Create a new sensor
@csrf_exempt
def sensors(request):

    print("create sensor")

    if request.method == 'POST':
        # Parsing POST request body
        body_utf = request.body.decode('utf-8')
        sensorLoad = json.loads(body_utf)

        # if there is just one sensor
        if type(sensorLoad) is dict:

            registerSensor(sensorLoad)

        # if there is more than one sensors (a list)
        elif type(sensorLoad) is list:

            for sensor in sensorLoad:
                registerSensor(sensor)

        response = HttpResponse(status=201)
        # response['Location'] = "http://localhost:8000/visitors/sensor/"+str(sensor['_id'])

    return response


# Get sensor information
def sensor(request, sensor_id):

    print("get sensor", request, sensor_id)

    # Connect to the DB using the sensors collection
    sensorData = connectToDB("sensors")

    cursor = sensorData.find({"_id": sensor_id})

    myDump = dumps(cursor)

    print("found sensor", myDump)

    #remove [  ]
    myDump = myDump[1:-1]

    if len(myDump) == 0:
        return HttpResponse(status=403)
    else:
        return JsonResponse(myDump, safe=False)


# Return sensor if it exists
def getSensorInfo(sensor_id):

    # Connect to the DB using the sensors collection
    sensorData = connectToDB("sensors")

    cursor = sensorData.find({'_id': sensor_id});

    if cursor.count() != 0:
        return cursor[0]
    else:
        return {}