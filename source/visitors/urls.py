from django.conf.urls import url

from . import views

app_name = 'visitors'

urlpatterns = [
    # /visitors/
    url(r'^$', views.index, name='index'),

    # /visitors/countsBySquare
    url(r'^countsBySquare/$', views.countsBySquare, name='countsBySquare'),

    # /visitors/directionsBySquare
    url(r'^directionsBySquare/$', views.directionsBySquare, name='directions'),

    # /visitors/sensorCounts
    url(r'^sensorCounts/$', views.sensorCounts, name='sensorCounts'),

    # /visitors/sensorCounts
    url(r'^sensorCountsTotal/$', views.sensorCountsTotal, name='sensorCountsTotal'),

    # /visitors/paths
    url(r'^paths/$', views.paths, name='paths'),

    # /visitors/measurementsByHour
    url(r'^measurementsByHour/$', views.measurementsByHour, name='measurementsByHour'),

    # /visitors/measurementsByHour
    url(r'^measurementsByHourTotal/$', views.measurementsByHourTotal, name='measurementsByHourTotal'),

    # /visitors/mapBounds
    url(r'^mapBounds/$', views.mapBounds, name='mapBounds'),

    # /visitors/statistics
    url(r'^statistics/$', views.statistics, name='statistics'),

    # /visitors/msmts
    url(r'^msmts/$', views.msmts, name='msmts'),

    # /visitors/msmts_b
    url(r'^msmts_b/$', views.msmts_b, name='msmts_b'),

    # /visitors/sensors
    url(r'^sensors/$', views.sensors, name='sensors'),

    # /visitors/sensors/xxx
    url(r'^sensors/(?P<sensor_id>.*)/$', views.sensor, name='sensor'),

    # /visitors/getInfoPrevision
    url(r'^countSince/$', views.countSince, name='countSince'),

    # /visitors/getAllCoordinates
    url(r'^getAllCoordinates/$', views.getAllCoordinates, name='getAllCoordinates'),

    # /visitors/measurementsBySpeed
    url(r'^measurementsBySpeed/$', views.measurementsBySpeed, name='measurementsBySpeed'),

    # /visitors/measurementsBySpeed
    url(r'^measurementsBySpeedTotal/$', views.measurementsBySpeedTotal, name='measurementsBySpeedTotal'),

    # /visitors/getSensorFromCoordinates
    url(r'^getSensorFromCoordinates/$', views.getSensorFromCoordinates, name='getSensorFromCoordinates'),

    # /visitors/pathsFromSensor
    url(r'^pathFromSensor/$', views.pathFromSensor, name='pathFromSensor'),
]
