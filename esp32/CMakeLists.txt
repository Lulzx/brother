# ESP-IDF CMakeLists.txt for Zig integration
# This allows building the Zig code with ESP-IDF toolchain

cmake_minimum_required(VERSION 3.16)

set(EXTRA_COMPONENT_DIRS $ENV{IDF_PATH}/examples/common_components/protocol_examples_common)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(print_bridge)
