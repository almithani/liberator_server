#!/bin/sh


for entry in input/*
do
  python3 unpack.py "$entry"
done

