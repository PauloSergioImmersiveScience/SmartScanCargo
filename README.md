# SmartScanCargo

Computer Vision System for Detecting Suspicious Cargo in X-ray Port Container Images.

## Description

SmartScanCargo is a web-based tool for interactive analysis of X-ray container images.

The system allows the user to:

- Load an X-ray image;
- Select two points with the mouse;
- Define a rectangular region of interest;
- Apply local histogram equalization only inside the selected region;
- Restore the original image;
- Download the locally equalized image.

## Main Files

- `index.html`: main web interface
- `script.js`: JavaScript code for image interaction and local histogram equalization
- `style.css`: visual style of the interface

## Access

This prototype uses a simple local password screen before opening the system.

> Important: this is not a strong security mechanism, because the JavaScript code is visible in GitHub Pages.

## Project

This software is part of a Computer Vision research project for X-ray analysis of port containers.
